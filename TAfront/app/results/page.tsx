"use client";
import {Suspense} from "react";
import { useEffect, useState } from "react";
import { useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import styles from "./results.module.css";
import ReactMarkdown from "react-markdown";
import { FlightOption, HotelOption, ChatBackendState } from "./types/travel";

type Action = { agent: string; status: string; detail: string };

type WeatherSummary = {
  avg_temp_c: number;
  condition: string;
  packing_note: string;
};

function ResultsPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const q = searchParams.get("q") || "";
  const plan = searchParams.get("plan") || "";

  const [answer, setAnswer] = useState("");
  const [actions, setActions] = useState<Action[]>([]);
  const [loading, setLoading] = useState(false);

  const [downloadingPlan, setDownloadingPlan] = useState(false);
  const [backendState, setBackendState] = useState<ChatBackendState | null>(
    null
  );
  const [weather, setWeather] = useState<WeatherSummary | null>(null);

  const [flightResults, setFlightResults] = useState<FlightOption[]>([]);
  const [hotelResults, setHotelResults] = useState<HotelOption[]>([]);
  const isBothAgent = backendState?.last_agent === "both";

  const [flightSort, setFlightSort] = useState<"price" | "departTime" | "stops">(
    "price"
  );
  const [hotelSort, setHotelSort] = useState<"price" | "rating">("price");

  const [maxStops, setMaxStops] = useState<number | null>(null);
  const [maxHotelPrice, setMaxHotelPrice] = useState<number | null>(null);
  const [minRating, setMinRating] = useState<number | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const existing = window.localStorage.getItem("travelai_session_id");
      if (existing) {
        setSessionId(existing);
      } else {
        const newId =
          typeof window.crypto !== "undefined" &&
          "randomUUID" in window.crypto
            ? window.crypto.randomUUID()
            : Math.random().toString(36).slice(2);
        window.localStorage.setItem("travelai_session_id", newId);
        setSessionId(newId);
      }
    } catch (err) {
      console.error("Error accessing localStorage", err);
    }
  }, []);

  const handleDownloadPlan = async () => {
    if (!plan) return;
    try {
      setDownloadingPlan(true);
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/itinerary/download`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: plan }),
        }
      );
      if (!res.ok) {
        console.error("Download failed");
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "itinerary.txt";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } finally {
      setDownloadingPlan(false);
    }
  };

  console.log("backendState:", backendState, "isBothAgent:", isBothAgent);
  console.log("flightResults:", flightResults);
  console.log("hotelResults:", hotelResults);

  if (plan && !q) {
    return (
      <main className={styles.page}>
        <div className={styles.overlay}>
          <header className={styles.header}>
            <button
              onClick={() => router.push("/")}
              className={styles.backBtn}
            >
              ← Back
            </button>
            <div className={styles.queryBlock}>
              <div className={styles.label}>Planned trip</div>
            </div>
          </header>

          <section className={styles.resultCard}>
            <h2 className={styles.title}>Your itinerary</h2>
            <div className={styles.answer}>
              <ReactMarkdown>{plan}</ReactMarkdown>
            </div>
            <div className={styles.buttonRow}>
              <button
                onClick={handleDownloadPlan}
                disabled={downloadingPlan}
                className={styles.primaryBtn}
              >
                {downloadingPlan ? "Downloading..." : "Download Itinerary"}
              </button>
            </div>
          </section>
        </div>
      </main>
    );
  }

  useEffect(() => {
    if (!q || !sessionId) return;

    const run = async () => {
      setLoading(true);
      setAnswer("");
      setActions([]);

      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/chat`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              session_id: sessionId, // was "demo-session-1"
              messages: [{ role: "user", content: q }],
            }),
          }
        );

        if (!res.ok) {
          const text = await res.text();
          setAnswer(`Server error: ${text}`);
          return;
        }

        const data = await res.json();
        console.log("CHAT DATA:", data);
        setAnswer(data.reply || "No reply from agent.");
        setActions(data.actions || []);
        setBackendState(data.state || null);
        setFlightResults(data.state?.flight_results ?? []);
        setHotelResults(data.state?.hotel_results ?? []);
        setWeather(data.state?.weather_info ?? null);
      } catch {
        setAnswer("Network error. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [q, sessionId]);

  if (!q) {
    return (
      <main className={styles.page}>
        <div className={styles.overlay}>
          <div className={styles.resultCard}>
            <p>No query provided.</p>
            <button
              onClick={() => router.push("/")}
              className={styles.backBtn}
            >
              ← Back to search
            </button>
          </div>
        </div>
      </main>
    );
  }

  const visibleFlights = [...flightResults]
    .filter((f) => (maxStops == null ? true : f.stops <= maxStops))
    .sort((a, b) => {
      if (flightSort === "price") {
        const priceA =
          typeof a.price_total === "string"
            ? Number(a.price_total)
            : a.price_total ?? Infinity;
        const priceB =
          typeof b.price_total === "string"
            ? Number(b.price_total)
            : b.price_total ?? Infinity;
        return priceA - priceB;
      }
      if (flightSort === "stops") return a.stops - b.stops;

      return (
        new Date(a.departure_time).getTime() -
        new Date(b.departure_time).getTime()
      );
    });

  const visibleHotels = [...hotelResults]
    .filter((h) =>
      minRating == null || h.overall_rating == null
        ? true
        : h.overall_rating >= minRating
    )
    .filter((h) => {
      if (maxHotelPrice == null) return true;
      const priceStr = String(h.night_price || "");
      const price = Number(priceStr.replace(/[^0-9.]/g, "")) || 0;
      return price <= maxHotelPrice;
    })
    .sort((a, b) => {
      if (hotelSort === "price") {
        const priceAStr = String(a.night_price || "");
        const priceA = Number(priceAStr.replace(/[^0-9.]/g, "")) || 0;
        const priceBStr = String(b.night_price || "");
        const priceB = Number(priceBStr.replace(/[^0-9.]/g, "")) || 0;
        return priceA - priceB;
      }
      if (hotelSort === "rating")
        return (b.overall_rating ?? 0) - (a.overall_rating ?? 0);
      return 0;
    });

  return (
    <main className={styles.page}>
      <div className={styles.overlay}>
        <header className={styles.header}>
          <button
            onClick={() => router.push("/")}
            className={styles.backBtn}
          >
            ← Back
          </button>
          <div className={styles.queryBlock}>
            <div className={styles.label}>Your query</div>
            <div className={styles.queryText}>{q}</div>
          </div>
        </header>

        <section className={styles.resultCard}>
          <h2 className={styles.title}>Results</h2>

          {loading && (
            <div className={styles.loadingWrapper}>
              <img
                src="\peace-peace-out.gif"
                alt="Loading results..."
                className={styles.loadingGif}
              />
              <div className={styles.status}>Loading Results...</div>
            </div>
          )}

          {!loading && !isBothAgent && (
            <>
              {actions.length > 0 && (
                <ul className={styles.actions}>
                  {actions.map((a, i) => (
                    <li key={i}>
                      <span className={styles.agent}>{a.agent}</span>
                      <span className={styles.detail}>{a.detail}</span>
                    </li>
                  ))}
                </ul>
              )}

              {/* Single Flight Agent */}
              {backendState?.last_agent === "flight" &&
                visibleFlights.length > 0 && (
                  <div className={styles.singleAgentSection}>
                    <h3 className={styles.sectionTitle}>✈️ Flight Options</h3>

                    <div className={styles.filterRow}>
                      <label>
                        Max stops:
                        <select
                          value={maxStops ?? ""}
                          onChange={(e) =>
                            setMaxStops(
                              e.target.value ? Number(e.target.value) : null
                            )
                          }
                        >
                          <option value="">Any</option>
                          <option value="0">Non‑stop</option>
                          <option value="1">1 or less</option>
                          <option value="2">2 or less</option>
                        </select>
                      </label>

                      <label>
                        Sort by:
                        <select
                          value={flightSort}
                          onChange={(e) =>
                            setFlightSort(e.target.value as any)
                          }
                        >
                          <option value="price">Price</option>
                          <option value="departTime">Departure time</option>
                          <option value="stops">Stops</option>
                        </select>
                      </label>
                    </div>

                    <div className={styles.cardsContainer}>
                      {visibleFlights.map((f) => (
                        <div key={f.id} className={styles.card}>
                          <div className={styles.cardHeader}>
                            <div className={styles.airline}>
                              {f.carrier_code}
                            </div>
                            <div className={styles.price}>
                              {f.price_total}
                            </div>
                          </div>
                          <div className={styles.cardBody}>
                            <div className={styles.timeRow}>
                              <div className={styles.timeBlock}>
                                <div className={styles.label}>Departure</div>
                                <div className={styles.time}>
                                  {f.departure_time.split("T")[1] || "—"}
                                </div>
                              </div>
                              <div className={styles.arrow}>→</div>
                              <div className={styles.timeBlock}>
                                <div className={styles.label}>Arrival</div>
                                <div className={styles.time}>
                                  {f.arrival_time.split("T")[1] || "—"}
                                </div>
                              </div>
                            </div>
                            <div className={styles.detailRow}>
                              <span className={styles.badge}>
                                {f.stops === 0
                                  ? "✓ Non-stop"
                                  : `${f.stops} stop(s)`}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              {/* Single Hotel Agent */}
              {backendState?.last_agent === "hotel" &&
                visibleHotels.length > 0 && (
                  <div className={styles.singleAgentSection}>
                    {weather && (
                      <div className={styles.weatherWrapper}>
                        <div className={styles.weatherBox}>
                          <div className={styles.weatherTitle}>
                            🌦️Weather forecast
                          </div>
                          <div className={styles.weatherMeta}>
                            Avg temperature: {weather.avg_temp_c}°C
                          </div>
                          <div>{weather.condition}</div>
                        </div>
                        <div className={styles.packingBox}>
                          <div className={styles.packingTitle}>
                            🛍️Packing note
                          </div>
                          <div>{weather.packing_note}</div>
                        </div>
                      </div>
                    )}
                    <h3 className={styles.sectionTitle}>🏨 Hotel Options</h3>

                    <div className={styles.filterRow}>
                      <label>
                        Min rating:
                        <input
                          type="number"
                          min={0}
                          max={5}
                          step={0.1}
                          value={minRating ?? ""}
                          onChange={(e) =>
                            setMinRating(
                              e.target.value ? Number(e.target.value) : null
                            )
                          }
                          placeholder="e.g. 3.5"
                        />
                      </label>

                      <label>
                        Max price:
                        <input
                          type="number"
                          value={maxHotelPrice ?? ""}
                          onChange={(e) =>
                            setMaxHotelPrice(
                              e.target.value ? Number(e.target.value) : null
                            )
                          }
                          placeholder="per night"
                        />
                      </label>

                      <label>
                        Sort by:
                        <select
                          value={hotelSort}
                          onChange={(e) =>
                            setHotelSort(e.target.value as any)
                          }
                        >
                          <option value="price">Price</option>
                          <option value="rating">Rating</option>
                        </select>
                      </label>
                    </div>

                    <div className={styles.cardsContainer}>
                      {visibleHotels.map((h) => (
                        <a
                          key={h.name + String(h.link)}
                          href={h.link || "#"}
                          target={h.link ? "_blank" : ""}
                          rel={h.link ? "noreferrer" : ""}
                          className={styles.hotelCard}
                          style={{
                            cursor: h.link ? "pointer" : "default",
                          }}
                        >
                          <div className={styles.cardHeader}>
                            <div className={styles.hotelName}>{h.name}</div>
                            <div className={styles.price}>
                              {h.night_price || "—"}
                            </div>
                          </div>
                          <div className={styles.cardBody}>
                            <div className={styles.ratingRow}>
                              <span className={styles.rating}>
                                ⭐ {h.overall_rating || "—"}
                              </span>
                              <span className={styles.reviews}>
                                {h.reviews_count || 0} reviews
                              </span>
                            </div>
                            {h.link && (
                              <div className={styles.bookingHint}>
                                Click to book →
                              </div>
                            )}
                          </div>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

              {/* Fallback */}
              {!visibleFlights.length && !visibleHotels.length && (
                answer && <pre className={styles.answer}>{answer}</pre>
              )}
            </>
          )}
          {!loading && isBothAgent && (
            <>
              {actions.length > 0 && (
                <ul className={styles.actions}>
                  {actions.map((a, i) => (
                    <li key={i}>
                      <span className={styles.agent}>{a.agent}</span>
                      <span className={styles.detail}>{a.detail}</span>
                    </li>
                  ))}
                </ul>
              )}
              {weather && (
                <div className={styles.weatherWrapper}>
                  <div className={styles.weatherBox}>
                    <div className={styles.weatherTitle}>
                      🌦️Weather forecast
                    </div>
                    <div className={styles.weatherMeta}>
                      Avg temperature: {weather.avg_temp_c}°C
                    </div>
                    <div>{weather.condition}</div>
                  </div>
                  <div className={styles.packingBox}>
                    <div className={styles.packingTitle}>🛍️Packing note</div>
                    <div>{weather.packing_note}</div>
                  </div>
                </div>
              )}

              <div className={styles.bothGrid}>
                <div className={styles.box}>
                  <h3 className={styles.boxTitle}>Flight options</h3>

                  {/* Flight controls */}
                  <div className={styles.filterRow}>
                    <label>
                      Max stops:
                      <select
                        value={maxStops ?? ""}
                        onChange={(e) =>
                          setMaxStops(
                            e.target.value ? Number(e.target.value) : null
                          )
                        }
                      >
                        <option value="">Any</option>
                        <option value="0">Non‑stop</option>
                        <option value="1">1 or less</option>
                        <option value="2">2 or less</option>
                      </select>
                    </label>

                    <label>
                      Sort by:
                      <select
                        value={flightSort}
                        onChange={(e) =>
                          setFlightSort(e.target.value as any)
                        }
                      >
                        <option value="price">Price</option>
                        <option value="departTime">Departure time</option>
                        <option value="stops">Stops</option>
                      </select>
                    </label>
                  </div>

                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Airline</th>
                        <th>Depart</th>
                        <th>Arrive</th>
                        <th>Stops</th>
                        <th>Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleFlights.map((f) => (
                        <tr key={f.id}>
                          <td>{f.carrier_code}</td>
                          <td>{f.departure_time}</td>
                          <td>{f.arrival_time}</td>
                          <td>
                            {f.stops === 0
                              ? "Non‑stop"
                              : `${f.stops} stop(s)`}
                          </td>
                          <td>{f.price_total}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className={styles.box}>
                  <h3 className={styles.boxTitle}>Hotel options</h3>

                  {/* Hotel controls */}
                  <div className={styles.filterRow}>
                    <label>
                      Min rating:
                      <input
                        type="number"
                        min={0}
                        max={5}
                        step={0.1}
                        value={minRating ?? ""}
                        onChange={(e) =>
                          setMinRating(
                            e.target.value ? Number(e.target.value) : null
                          )
                        }
                        placeholder="e.g. 3.5"
                      />
                    </label>

                    <label>
                      Max price:
                      <input
                        type="number"
                        value={maxHotelPrice ?? ""}
                        onChange={(e) =>
                          setMaxHotelPrice(
                            e.target.value ? Number(e.target.value) : null
                          )
                        }
                        placeholder="per night"
                      />
                    </label>

                    <label>
                      Sort by:
                      <select
                        value={hotelSort}
                        onChange={(e) =>
                          setHotelSort(e.target.value as any)
                        }
                      >
                        <option value="price">Price</option>
                        <option value="rating">Rating</option>
                      </select>
                    </label>
                  </div>

                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Hotel</th>
                        <th>Rating</th>
                        <th>Night price</th>
                        <th>Reviews</th>
                        <th>Booking Link</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleHotels.map((h) => (
                        <tr key={h.name + String(h.link)}>
                          <td>{h.name}</td>
                          <td>{h.overall_rating ?? "—"}</td>
                          <td>{h.night_price ?? "—"}</td>
                          <td>{h.reviews_count ?? "—"}</td>
                          <td>
                            {h.link ? (
                              <a
                                href={h.link}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Book
                              </a>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
export default function ResultsPage() {
  return (
    <Suspense>
      <ResultsPageInner />
    </Suspense>
  );
}
