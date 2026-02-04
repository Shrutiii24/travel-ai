import os, httpx
from typing import Dict, Any, List
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from uuid import uuid4
from io import BytesIO
from fastapi import HTTPException
from models import ChatRequest, ChatResponse, AgentAction
from graph import graph_app
from datetime import datetime, date
from fastapi import APIRouter
from models import WeatherRequest, WeatherSummary

load_dotenv()

app = FastAPI(title="TravelAI LangGraph Backend")

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
AMADEUS_API_KEY = os.getenv("AMADEUS_API_KEY")
AMADEUS_API_SECRET = os.getenv("AMADEUS_API_SECRET")
OPENWEATHER_KEY = os.getenv("OPENWEATHER_API_KEY")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://travel-ai-y3cb.onrender.com"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

weather_router = APIRouter()

@weather_router.post("/weather", response_model=WeatherSummary)
async def get_weather(req: WeatherRequest) -> WeatherSummary:
    url = "https://api.openweathermap.org/data/2.5/forecast"
    params = {
        "q": req.city,         
        "units": "metric",
        "appid": OPENWEATHER_KEY,
    }

    async with httpx.AsyncClient() as client:
        resp = await client.get(url, params=params)
        resp.raise_for_status()
        data = resp.json()

    entries = data.get("list", [])
    temps: list[float] = []
    rainy_slots = 0
    descriptions: list[str] = []

    for item in entries:
        dt_txt = item.get("dt_txt") 
        if not dt_txt:
            continue
        dt = datetime.strptime(dt_txt, "%Y-%m-%d %H:%M:%S")
        day = dt.date()

        if not (req.start_date <= day <= req.end_date):
            continue

        main = item.get("main", {})
        if "temp" in main:
            temps.append(main["temp"])

        rain_vol = 0.0
        if "rain" in item and "3h" in item["rain"]:
            rain_vol += float(item["rain"]["3h"] or 0)
        if "snow" in item and "3h" in item["snow"]:
            rain_vol += float(item["snow"]["3h"] or 0)

        if rain_vol > 0:
            rainy_slots += 1

        weather_arr = item.get("weather") or []
        if weather_arr:
            desc = weather_arr[0].get("description")
            if desc:
                descriptions.append(desc)

    if not temps:
        return WeatherSummary(
            avg_temp_c=0,
            condition="unknown",
            packing_note=f"No forecast data for these dates in {req.city}. Pack for mixed conditions."
        )

    avg_temp = sum(temps) / len(temps)
    unique_desc = ", ".join(sorted(set(descriptions))[:3]) or "variable"

    if rainy_slots == 0:
        cond_label = "mostly dry"
    elif rainy_slots <= 4:
        cond_label = "some showers"
    else:
        cond_label = "quite rainy"

    if avg_temp < 10:
        note = "Pack warm layers, a jacket, and closed shoes."
    elif avg_temp < 22:
        note = "Pack light layers, a light jacket, and comfortable shoes."
    else:
        note = "Pack light clothes, breathable fabrics, and sunscreen."

    if rainy_slots > 0:
        note += " Include a compact umbrella or raincoat."

    return WeatherSummary(
        avg_temp_c=round(avg_temp, 1),
        condition=f"{cond_label} ({unique_desc})",
        packing_note=note,
    )

app.include_router(weather_router, prefix="/api")

@app.get("/")
async def root():
    return {"status": "ok", "message": "TravelAI backend running"}

@app.post("/api/chat", response_model=ChatResponse)
async def chat_endpoint(payload: ChatRequest):
    """
    Accept chat messages from frontend and run the LangGraph app.
    Uses session_id as LangGraph thread_id for state + interruptions.
    """
    state_messages: List[Dict[str, str]] = [
        {"role": m.role, "content": m.content} for m in payload.messages
    ]

    final_state: Dict[str, Any] = await graph_app.ainvoke(
        {"messages": state_messages},
        config={"configurable": {"thread_id": payload.session_id}},
    )
    assistant_msgs = [
        m["content"]
        for m in final_state.get("messages", [])
        if m.get("role") == "assistant"
    ]
    reply = "\n\n".join(assistant_msgs) if assistant_msgs else ""

    actions: list[AgentAction] = []
    last_agent = final_state.get("last_agent")

    if "flight_results" in final_state:
        flights = final_state["flight_results"]
        count = len(flights) if isinstance(flights, list) else 1
        actions.append(
            AgentAction(
                agent="flight",
                status="completed",
                detail=f"{count} flight option(s) found.",
            )
        )

    if "hotel_results" in final_state:
        hotels = final_state["hotel_results"]
        count = len(hotels) if isinstance(hotels, list) else 1
        actions.append(
            AgentAction(
                agent="hotel",
                status="completed",
                detail=f"{count} hotel option(s) found.",
            )
        )

    if not actions and last_agent:
        actions.append(
            AgentAction(agent=last_agent, status="running", detail="Processing...")
        )

    state_out = {
        "last_agent": final_state.get("last_agent"),
        "has_flights": bool(final_state.get("flight_results")),
        "has_hotels": bool(final_state.get("hotel_results")),
        "flight_results": final_state.get("flight_results", []),
        "hotel_results": final_state.get("hotel_results", []),
        "weather_info": final_state.get("weather_info"),
    }

    return ChatResponse(reply=reply, actions=actions, state=state_out)

class ItineraryPayload(BaseModel):
    content: str

ITINERARY_STORE: Dict[str, str] = {}

@app.post("/api/itinerary/download")
def download_itinerary(payload: ItineraryPayload):
    """
    Take itinerary text and return it as a downloadable file.
    Currently returns a .txt file.
    """
    buffer = BytesIO()
    buffer.write(payload.content.encode("utf-8"))
    buffer.seek(0)

    return StreamingResponse(
        buffer,
        media_type="text/plain",
        headers={"Content-Disposition": 'attachment; filename="itinerary.txt"'},
    )
