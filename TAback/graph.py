import os
from datetime import datetime
from typing import TypedDict, List, Literal, Dict, Any
import httpx
import asyncio
import dateparser
from dotenv import load_dotenv
from amadeus import Client, ResponseError, Location
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver
from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel

load_dotenv()

class GraphState(TypedDict, total=False):
    messages: List[Dict[str, str]]
    last_agent: str
    flight_results: List[Dict[str, Any]]
    hotel_results: List[Dict[str, Any]]
    destination_city: str
    start_date: str
    end_date: str
    weather_info: Dict[str, Any]

llm = ChatGroq(
    model="llama-3.1-8b-instant",
    temperature=0.2,
)

amadeus = Client(
    client_id=os.getenv("AMADEUS_API_KEY"),
    client_secret=os.getenv("AMADEUS_API_SECRET"),
)

SERPAPI_KEY = os.getenv("SERPAPI_KEY")
SERPAPI_BASE = "https://serpapi.com/search"

BACKEND_BASE_URL = os.environ.get("BACKEND_BASE_URL", "http://localhost:8000")

async def serpapi_get(params: Dict[str, Any]) -> Dict[str, Any]:
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(
            SERPAPI_BASE,
            params={**params, "api_key": SERPAPI_KEY},
        )
        response.raise_for_status()
        return response.json()

async def fetch_weather_info(city: str, start_date: str, end_date: str) -> Dict[str, Any]:
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{BACKEND_BASE_URL}/api/weather",
            json={
                "city": city,
                "start_date": start_date,
                "end_date": end_date,
            },
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json()

def add_assistant_message(state: GraphState, content: str) -> GraphState:
    messages = state.get("messages", [])
    messages.append({"role": "assistant", "content": content})
    state["messages"] = messages
    return state

def get_last_user_message(state: GraphState) -> str:
    messages = state.get("messages", [])
    user_messages = [m for m in messages if m.get("role") == "user"]
    return user_messages[-1]["content"] if user_messages else ""

def normalize_single_date(text: str) -> str:
    """Parse any human date string into YYYY-MM-DD, or '' if not parseable."""
    if not text:
        return ""
    parsed = dateparser.parse(
        text,
        settings={
            "PREFER_DAY_OF_MONTH": "first",
            "PREFER_DATES_FROM": "future",
        },
    )
    if not parsed:
        return ""
    return parsed.strftime("%Y-%m-%d")

def normalize_date_range(text: str) -> tuple[str, str]:
    """
    Handle ranges like '15-20 January', '15 to 20 Jan 2026'.
    Returns (start_date, end_date) as YYYY-MM-DD or ('','') if not parseable.
    """
    if not text:
        return "", ""

    raw = text.replace("–", "-").replace("—", "-")

    if " to " in raw:
        parts = [p.strip() for p in raw.split(" to ", 1)]
    elif "-" in raw:
        parts = [p.strip() for p in raw.split("-", 1)]
    else:
        d = normalize_single_date(raw)
        return d, d

    if len(parts) < 2:
        d = normalize_single_date(raw)
        return d, d

    start_raw, end_raw = parts[0], parts[1]

    month_tokens = ["jan", "feb", "mar", "apr", "may", "jun",
                    "jul", "aug", "sep", "oct", "nov", "dec"]
    if any(m in start_raw.lower() for m in month_tokens):
        if not any(m in end_raw.lower() for m in month_tokens):
            end_raw = f"{end_raw} {start_raw}"

    start = normalize_single_date(start_raw)
    end = normalize_single_date(end_raw)
    return start, end

def is_valid_yyyy_mm_dd(d: str) -> bool:
    try:
        datetime.strptime(d, "%Y-%m-%d")
        return True
    except ValueError:
        return False

def coordinator_node(state: GraphState) -> GraphState:
    messages = state.get("messages", [])
    if not messages:
        return add_assistant_message(
            state,
            "Hi! Tell me your travel plan, like:\n"
            "- 'Find flights from Tokyo to Melbourne on 31 January'\n"
            "- 'Find hotels in Mumbai from 10-15 February 2026'\n"
            "- Or both in one message."
        )

    last_user_messages = [m for m in messages if m["role"] == "user"]
    if not last_user_messages:
        return state

    latest = last_user_messages[-1]["content"].lower()
    print("Coordinator saw:", latest)

    wants_flight = any(k in latest for k in ["flight", "flights", "fly", "ticket", "plane"])
    wants_hotel = any(k in latest for k in ["hotel", "stay", "room", "accommodation", "lodging"])

    if wants_flight and wants_hotel:
        state["last_agent"] = "both"
    elif wants_flight:
        state["last_agent"] = "flight"
    elif wants_hotel:
        state["last_agent"] = "hotel"
    else:
        state["last_agent"] = "both"

    return state

class FlightQuery(BaseModel):
    origin_city: str
    destination_city: str
    departure_date: str

class HotelQuery(BaseModel):
    city: str
    check_in: str
    check_out: str

flight_extract_prompt = ChatPromptTemplate.from_messages(
    [
        (
            "system",
            "Extract flight search details from the user message.\n"
            "Return JSON with:\n"
            "- origin_city: ONLY the origin city name, country name and airport code"
            "- destination_city: ONLY the destination city name or airport code.\n"
            "- departure_date: the departure date string as the user expressed it "
            "(e.g. '2026-01-31', '31-01-2026', '31 Jan 2026', '28 january').\n"
            "Do NOT return country names like 'Japan' or 'Australia'. Always return the main city.\n"
            "If the message also mentions hotels, ignore that for these fields.",
        ),
        ("human", "{message}"),
    ]
)
flight_extract_chain = flight_extract_prompt | llm.with_structured_output(FlightQuery)

hotel_extract_prompt = ChatPromptTemplate.from_messages(
    [
        (
            "system",
            "Extract hotel search details from the user message.\n"
            "Return JSON with:\n"
            "- city: ONLY the hotel city (full name or IATA code), no extra words.\n"
            "- check_in: the start of the stay or the first date in the date range "
            "(e.g. '15-20 January 2026' :: 15 jan, 'next weekend').\n"
            "- check_out: the end of the stay or the last date in the date range "
            "(e.g. '15-20 January 2026' :: 20 jan').\n"
            "If the message contains both flights and hotels, focus on the hotel part.",
        ),
        ("human", "{message}"),
    ]
)
hotel_extract_chain = hotel_extract_prompt | llm.with_structured_output(HotelQuery)

_IATA_CACHE: Dict[str, str] = {}

def resolve_to_iata(keyword: str) -> str:
    """
    Accepts city names, country names, or 3-letter tokens.
    Always resolve via Amadeus Airport & City Search, and cache results.
    Never blindly trust 3-letter text as valid IATA.
    """
    if not keyword:
        return ""

    kw = keyword.strip()
    if not kw:
        return ""

    kw_lower = kw.lower()

    if kw_lower in _IATA_CACHE:
        return _IATA_CACHE[kw_lower]

    try:
        response = amadeus.reference_data.locations.get(
            keyword=kw,
            subType=Location.ANY,
        )
        data = getattr(response, "data", None) or []
        if not isinstance(data, list):
            data = [data]

        if not data:
            print("resolve_to_iata: no results for", kw)
            return ""

        city_item = None
        airport_item = None
        for item in data:
            if not isinstance(item, dict):
                continue
            iata = item.get("iataCode")
            sub_type = item.get("subType")
            if sub_type == "CITY" and iata:
                city_item = item
                break
            if sub_type == "AIRPORT" and iata and airport_item is None:
                airport_item = item

        chosen = city_item or airport_item
        if not chosen:
            print("resolve_to_iata: entries but no usable iataCode for", kw, "raw:", data[:3])
            return ""

        iata = chosen.get("iataCode")
        _IATA_CACHE[kw_lower] = iata
        print("resolve_to_iata:", kw, "→", iata, "subType:", chosen.get("subType"))
        return iata

    except ResponseError as error:
        print("resolve_to_iata ResponseError:", repr(error))
        return ""
    except Exception as error:
        print("resolve_to_iata general error:", repr(error))
        return ""

def run_flights(state: GraphState) -> GraphState:
    last_user = get_last_user_message(state)

    try:
        fq: FlightQuery = flight_extract_chain.invoke({"message": last_user})
        print("FLIGHT EXTRACT RAW:", fq.dict())
    except Exception as exc:
        print("FLIGHT EXTRACT ERROR:", exc)
        return add_assistant_message(
            state,
            "[Flight Agent] I couldn't understand your flight request. "
            "Please say something like 'find flights from New York to Paris on 31 January'.",
        )

    origin_token = (fq.origin_city or "").strip()
    dest_token = (fq.destination_city or "").strip()
    departure_raw = (fq.departure_date or "").strip()
    departure_date = normalize_single_date(departure_raw)

    origin_iata = resolve_to_iata(origin_token)
    dest_iata = resolve_to_iata(dest_token)

    print(
        "FLIGHT TOKENS:",
        "origin=", repr(origin_token),
        "dest=", repr(dest_token),
        "raw_date=", repr(departure_raw),
        "norm_date=", repr(departure_date),
    )
    print("FLIGHT IATA:", origin_iata, dest_iata, departure_date)

    if not origin_iata or not dest_iata or not departure_date:
        missing_parts = []
        if not origin_iata:
            missing_parts.append("origin city/airport")
        if not dest_iata:
            missing_parts.append("destination city/airport")
        if not departure_date:
            missing_parts.append("date")
        missing_str = ", ".join(missing_parts) if missing_parts else "details"

        return add_assistant_message(
            state,
            f"[Flight Agent] I couldn't resolve your {missing_str}. "
            "Please say something like 'find flights from Tokyo to Melbourne on 31 January 2026'. "
            "You can also use airport or city codes like 'HND', 'MEL', 'DEL', 'BOM'.",
        )
    try:
        response = amadeus.shopping.flight_offers_search.get(
            originLocationCode=origin_iata,
            destinationLocationCode=dest_iata,
            departureDate=departure_date,
            adults=1,
            currencyCode="USD",
            max=5,
        )
        offers = getattr(response, "data", None) or []
        if not isinstance(offers, list):
            offers = [offers]

        if not offers:
            state["flight_results"] = []
            return add_assistant_message(
                state,
                f"[Flight Agent] No flights found for {origin_iata} → {dest_iata} on {departure_date}. "
                "Try a different date, or a nearby larger city/airport.",
            )
        state["flight_results"] = offers

        def pretty_dt(iso_str: str | None) -> str:
            if not iso_str:
                return "N/A"
            try:
                dt = datetime.fromisoformat(iso_str)
                return dt.strftime("%Y-%m-%d  T %H:%M:%S")
            except Exception:
                return iso_str

        clean_offers: List[Dict[str, Any]] = []
        for offer in offers[:9]:
            try:
                itineraries = offer.get("itineraries", [])
                first_itin = itineraries[0] if itineraries else {}
                segments = first_itin.get("segments", [])
                first_seg = segments[0] if segments else {}
                last_seg = segments[-1] if segments else {}

                departure_time = first_seg.get("departure", {}).get("at")
                arrival_time = last_seg.get("arrival", {}).get("at")
                carrier_code = first_seg.get("carrierCode")
                number_of_stops = max(len(segments) - 1, 0)
                price_total = offer.get("price", {}).get("total")
                offer_id = offer.get("id")

                departure_time = pretty_dt(departure_time)
                arrival_time = pretty_dt(arrival_time)

                clean_offers.append(
                    {
                        "id": offer_id,
                        "carrier_code": carrier_code,
                        "departure_time": departure_time,
                        "arrival_time": arrival_time,
                        "stops": number_of_stops,
                        "price_total": "$" + str(price_total),
                    }
                )
            except Exception as e:
                print("Error cleaning offer:", repr(e))
                continue

        state["flight_results"] = clean_offers

        if not clean_offers:
            return add_assistant_message(
                state,
                "[Flight Agent] Flights were found but could not be parsed correctly. "
                "Please try again or slightly adjust your search.",
            )

        summary_prompt = [
            {
                "role": "system",
                "content": (
                    "You are a flight search agent."
                    "Given a list of cleaned flight offers, "
                    "list 5-7 options with: airline (from carrier code), departure time, arrival time, "
                    "number of stops, total price, and a booking link to the airlines website\n"
                    "prioritize user satisfaction and cheapest options.\n"
                    "DO NOT invent or generate any external airline or URLs on your own."
                ),
            },
            {
                "role": "user",
                "content": (
                    f"User request: {last_user}\n"
                    f"Origin IATA: {origin_iata}\n"
                    f"Destination IATA: {dest_iata}\n"
                    f"Departure date: {departure_date}\n"
                    f"Cleaned offers JSON: {clean_offers}"
                ),
            },
        ]
        try:
            summary = llm.invoke(summary_prompt).content
            return add_assistant_message(
                state,
                f"# ✈️ Flight Options\nFound {len(clean_offers)} flight option(s) for you."
            )

        except ResponseError as error:
            print("AMADEUS FLIGHT ResponseError:", repr(error))
        return add_assistant_message(
            state,
            "[Flight Agent] I had trouble fetching flights from the provider (API error). "
            "Please double-check the cities and dates, or try again later.",
        )
    except Exception as error:
        import traceback
        print("AMADEUS FLIGHT general error:", repr(error))
        traceback.print_exc()
        return add_assistant_message(
            state,
            "[Flight Agent] Something went wrong while searching flights. "
            "Please try again or slightly adjust your cities/date.",
        )

def flight_agent_node(state: GraphState) -> GraphState:
    state["last_agent"] = "flight"
    return run_flights(state)

async def run_hotels_async(state: GraphState) -> GraphState:
    last_user = get_last_user_message(state)

    try:
        hq: HotelQuery = hotel_extract_chain.invoke({"message": last_user})
        print("HOTEL EXTRACT RAW:", hq.dict())
    except Exception as exc:
        print("HOTEL EXTRACT ERROR:", exc)
        return add_assistant_message(
            state,
            "[Hotel Agent] I couldn't understand your hotel request. "
            "Please say something like 'find hotels in Paris from 10-15 February 2026'.",
        )

    city_raw = (hq.city or "").strip()
    check_in_raw = (hq.check_in or "").strip()
    check_out_raw = (hq.check_out or "").strip()

    if check_in_raw and check_out_raw:
        check_in = normalize_single_date(check_in_raw)
        check_out = normalize_single_date(check_out_raw)
    elif check_in_raw and not check_out_raw:
        start, end = normalize_date_range(check_in_raw)
        check_in, check_out = start, end
    else:
        check_in, check_out = "", ""

    if not city_raw or not check_in or not check_out:
        return add_assistant_message(
            state,
            "[Hotel Agent] Please include city, check-in date, and check-out date, "
            "for example 'find hotels in Mumbai from 10-15 February 2026'.",
        )

    city_for_search = city_raw

    state["destination_city"] = city_for_search  
    state["start_date"] = check_in
    state["end_date"] = check_out

    if not (is_valid_yyyy_mm_dd(check_in) and is_valid_yyyy_mm_dd(check_out)):
        return add_assistant_message(
            state,
            "[Hotel Agent] I couldn't understand your dates. "
            "Please use a clear future range like '10-15 February 2026' or '2026-02-10 to 2026-02-15'.",
        )

    if check_in >= check_out:
        return add_assistant_message(
            state,
            "[Hotel Agent] Check-out must be after check-in. "
            "Please provide a valid date range such as '10-15 February 2026'.",
        )

    print("DEBUG SERP HOTELS:", city_for_search, check_in, check_out)
    try:
        serp_params = {
            "engine": "google_hotels",
            "q": city_for_search,
            "check_in_date": check_in,
            "check_out_date": check_out,
            "adults": 1,
            "currency": "USD",
            "hl": "en",
            "gl": "us",
        }

        results = await serpapi_get(serp_params)
        serp_error = results.get("error")
        if serp_error:
            print("SERPAPI HOTEL ERROR FIELD:", serp_error)

        properties = results.get("properties", []) or []

        if serp_error:
            return add_assistant_message(
                state,
                "[Hotel Agent] Our hotel search provider returned an error. "
                "Please try again in a minute or with slightly different dates or city.",
            )

        if not properties:
            return add_assistant_message(
                state,
                f"[Hotel Agent] No hotels found in {city_for_search} from {check_in} to {check_out}. "
                "Try different dates or another city.",
            )
        top_props = properties[:9]

        slim_props: List[Dict[str, Any]] = []
        for p in top_props:
            if not isinstance(p, dict):
                continue
            rate_info = p.get("rate_per_night") or {}
            name = p.get("name") or p.get("title") or ""
            price = rate_info.get("lowest") or rate_info.get("extracted_lowest")

            rating_raw = p.get("overall_rating") or p.get("rating")
            try:
                rating = float(rating_raw) if rating_raw is not None else None
            except Exception:
                rating = None

            reviews_raw = p.get("reviews") or p.get("reviews_count")
            try:
                reviews = int(reviews_raw) if reviews_raw is not None else None
            except Exception:
                reviews = None

            link = p.get("link") or p.get("booking_link") or None
            slim_props.append(
                {
                    "name": p.get("name"),
                    "night_price": rate_info.get("lowest") or rate_info.get("extracted_lowest"),
                    "overall_rating": p.get("overall_rating"),
                    "reviews_count": p.get("reviews"),
                    "link": p.get("link"),
                }
            )
        state["hotel_results"] = slim_props

        if not slim_props:
            return add_assistant_message(
                state,
                f"[Hotel Agent] Hotels were found but could not be parsed correctly for {city_for_search}.",
            )
        state["hotel_results"] = slim_props

        if not slim_props:
            return add_assistant_message(
                state,
                f"[Hotel Agent] No hotels found in {city_for_search} from {check_in} to {check_out}. "
                "Try different dates or another city.",
            )

        summary_prompt = [
            {
                "role": "system",
                "content": (
                    "You are a hotel search agent. "
                    "Use ONLY the given JSON list of hotels. "
                    "List 5-7 options, each with:\n"
                    "- Name: <name>\n"
                    "  Night Price: <night_price>\n"
                    "  Rating: <overall_rating>\n"
                    "  Reviews: <reviews_count>\n"
                    "  Link: <link>\n"
                    "Do not invent extra hotels or locations."
                ),
            },
            {
                "role": "user",
                "content": f"User request: {last_user}\nHotels JSON: {slim_props}",
            },
        ]
        summary = llm.invoke(summary_prompt).content
        return add_assistant_message(
            state,
            f"# 🏨 Hotel Options\nFound {len(slim_props)} hotel option(s) for you."
        )

    except Exception as exc:
        print("SERPAPI HOTEL ERROR (EXCEPTION):", exc)
        return add_assistant_message(
            state,
            "[Hotel Agent] I had trouble fetching hotels (network or provider error). "
            "Please try again after some time or slightly adjust your dates/city.",
        )

def hotel_agent_node(state: GraphState) -> GraphState:
    state["last_agent"] = "hotel"
    state = asyncio.run(run_hotels_async(state))

    city = state.get("destination_city")
    start = state.get("start_date")
    end = state.get("end_date")

    print("HOTEL NODE TRIP INFO:", city, start, end)

    if city and start and end:
        try:
            weather_info = asyncio.run(
                fetch_weather_info(city, start, end)
            )
            print("WEATHER_INFO RETURNED (hotel):", weather_info)
            state["weather_info"] = weather_info
        except Exception as e:
            print("Weather fetch failed in hotel_agent_node:", e)

    return state

def both_agent_node(state: GraphState) -> GraphState:
    state = run_flights(state)
    state = asyncio.run(run_hotels_async(state))

    city = state.get("destination_city")
    start = state.get("start_date")
    end = state.get("end_date")
    print("BOTH NODE TRIP INFO:", city, start, end)

    if city and start and end:
        try:
            weather_info = asyncio.run(
                fetch_weather_info(city, start, end)
            )
            print("WEATHER_INFO RETURNED (both):", weather_info)
            state["weather_info"] = weather_info
        except Exception as e:
            print("Weather fetch failed in both_agent_node:", e)

    state["last_agent"] = "both"
    return state

def router(
    state: GraphState,
) -> Literal["flight_agent", "hotel_agent", "both_agent", "end"]:
    last_agent = state.get("last_agent", "both")

    if last_agent == "both":
        return "both_agent"
    if last_agent == "flight":
        return "flight_agent"
    if last_agent == "hotel":
        return "hotel_agent"
    return "end"

def build_graph():
    graph = StateGraph(GraphState)

    graph.add_node("coordinator", coordinator_node)
    graph.add_node("flight_agent", flight_agent_node)
    graph.add_node("hotel_agent", hotel_agent_node)
    graph.add_node("both_agent", both_agent_node)
    graph.set_entry_point("coordinator")

    graph.add_conditional_edges(
        "coordinator",
        router,
        {
            "flight_agent": "flight_agent",
            "hotel_agent": "hotel_agent",
            "both_agent": "both_agent",
            "end": END,
        },
    )

    graph.add_edge("flight_agent", END)
    graph.add_edge("hotel_agent", END)
    graph.add_edge("both_agent", END)

    checkpointer = MemorySaver()
    app = graph.compile(checkpointer=checkpointer)
    return app

graph_app = build_graph()
