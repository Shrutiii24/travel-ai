import { NextRequest, NextResponse } from "next/server";
const GROQ_API_KEY = process.env.GROQ_API_KEY;
function jsonError(message: string, status = 400, details?: any) {
  return NextResponse.json({ error: message, details: details ?? null }, { status });
}

export async function POST(req: NextRequest) {
  try {
    if (!GROQ_API_KEY) {
      return jsonError("GROQ_API_KEY is not set in environment variables.", 500);
    }

    const body = await req.json();
    const { destination, dates, flexible, groupType } = body as {
      destination?: string;
      dates?: string | null;
      flexible?: boolean;
      groupType?: "solo" | "couple" | "family" | "group";
    };

    if (!destination || !groupType) {
      return jsonError("destination and groupType are required", 400);
    }

    const parts: string[] = [
      "You are a precise, practical travel agent and itinerary planner.",
      `Destination: ${destination}.`,
    ];

    if (dates) {
      parts.push(`Dates: ${dates}.`);
    } else if (flexible) {
      parts.push("Dates: traveler is flexible on exact dates.");
    }

    parts.push(`Travelers: ${groupType}.`);
    parts.push(
      "Plan a realistic, bookable trip with: " +
        "1) Flights (high-level options, suggested times and airlines), " +
        "2) Stays (areas + 2–3 example hotels with rough price range), " +
        "3) A detailed day-by-day activity plan with time of day and neighborhoods."
    );
    parts.push(
      "Return the answer as markdown with clear sections: Overview, Flights, Stays, Day-by-day plan."
    );

    const prompt = parts.join("\n");

    const groqRes = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama-3.1-8b-instant",
          temperature: 0.2,
          messages: [
            {
              role: "system",
              content: "You are a precise, practical travel planner.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
        }),
      }
    );

    const rawText = await groqRes.text();

    if (!groqRes.ok) {
      let parsed: any = null;
      try {
        parsed = JSON.parse(rawText);
      } catch {
      }
      console.error("[trip-setup] Groq error:", rawText);
      return jsonError(
        "Failed to generate trip plan from Groq.",
        groqRes.status,
        parsed ?? rawText
      );
    }

    let data: any;
    try {
      data = JSON.parse(rawText);
    } catch {
      console.error("[trip-setup] Failed to parse Groq JSON:", rawText);
      return jsonError("Invalid response from Groq.", 500);
    }

    const itinerary: string =
      data?.choices?.[0]?.message?.content ?? "No itinerary generated.";

    return NextResponse.json(
      {
        itinerary,
        meta: {
          destination,
          dates: dates || null,
          flexible: !!flexible,
          groupType,
        },
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[trip-setup] route error:", err);
    return jsonError(
      err?.message || "Failed to generate trip plan. Please try again.",
      500
    );
  }
}