# TravelAI - Multi-Agent AI Travel Planning Assistant

TravelAI is a full-stack AI-powered travel planning assistant built using LangGraph, FastAPI, and Next.js. It helps users generate personalized travel plans by coordinating multiple AI agents responsible for flight search, hotel recommendations, weather forecasting, and itinerary generation.

**Live Demo:** https://travel-ai-y3cb.onrender.com/

---

## Features

- Multi-agent travel planning using LangGraph
- Flight search using the Amadeus API
- Hotel recommendations
- Weather forecasts and packing suggestions
- Natural language travel planning
- Human-in-the-loop confirmation workflow
- FastAPI backend with asynchronous API handling
- Responsive frontend built with Next.js

---

## Tech Stack

### Frontend
- Next.js
- React
- TypeScript

### Backend
- Python
- FastAPI
- LangGraph
- Pydantic
- HTTPX

### AI
- Groq API
- Llama 3.1
- Prompt Engineering

### External APIs
- Amadeus API
- OpenWeather API
- SerpAPI

---

## System Architecture

```
User
   │
Next.js Frontend
   │
FastAPI Backend
   │
LangGraph Coordinator
   ├── Flight Agent
   ├── Hotel Agent
   └── Weather Agent
          │
   External APIs
          │
  Personalized Travel Plan
```

## Workflow

1. User enters travel preferences.
2. The Coordinator Agent interprets the request and manages the workflow.
3. Flight Agent retrieves available flight options.
4. Hotel Agent recommends accommodations.
5. Weather Agent provides forecasts and packing suggestions.
6. The Coordinator combines responses into a complete travel itinerary.
7. The user reviews and confirms the final travel plan.

---

## Project Structure

```
travel-ai/
│
├── TAfront/              # Next.js frontend
├── TAback/               # FastAPI backend
│   ├── agents/
│   ├── graph/
│   ├── routes/
│   ├── services/
│   └── main.py
│
└── README.md
```

## Future Improvements

- Multi-city itinerary planning
- Budget optimization
- User authentication
- Saved travel history
- Google Maps integration
- Flight price alerts
