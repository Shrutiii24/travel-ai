from typing import List, Optional, Dict, Any
from pydantic import BaseModel
from datetime import date

class ChatMessage(BaseModel):
    role: str           # "user" | "agent" | "system"
    content: str

class ChatRequest(BaseModel):
    session_id: str     # used to keep state per user/tab
    messages: List[ChatMessage]

class AgentAction(BaseModel):
    agent: str
    status: str         # "running" | "completed" | "interrupted"
    detail: Optional[str] = None

class ChatResponse(BaseModel):
    reply: str
    actions: List[AgentAction]
    state: Dict[str, Any] 

class WeatherRequest(BaseModel):
    city: str         
    start_date: date   
    end_date: date     

class WeatherSummary(BaseModel):
    avg_temp_c: float
    condition: str
    packing_note: str