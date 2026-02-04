"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./TripSetup.module.css";

export default function TripSetupPage() {
  const router = useRouter();
  const [destination, setDestination] = useState("");
  const [dates, setDates] = useState("");
  const [flexible, setFlexible] = useState(false);
  const [groupType, setGroupType] = useState<
    "solo" | "couple" | "family" | "group"
  >("solo");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/search/trip-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destination,
          dates: dates || null,
          flexible,
          groupType,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        console.error("[trip-setup] API error:", data);
        throw new Error(data.error || "Failed to generate trip plan");
      }

      const itinerary: string = data.itinerary;

      const params = new URLSearchParams({
        plan: itinerary,
        destination,
        groupType,
        dates: dates || "",
        flexible: flexible ? "1" : "0",
      });

      router.push(`/results?${params.toString()}`);
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Start a new trip</h1>
        <p className={styles.subtitle}>
          Tell us the basics and we’ll plan the flights, stays, and activities for you.
        </p>

        <form onSubmit={handleSubmit} className={styles.form}>
          <label className={styles.field}>
            <span className={styles.labelText}>Destination</span>
            <input
              type="text"
              placeholder="Goa, any beach near Mumbai, Bali..."
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              required
              className={styles.input}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.labelText}>Dates</span>
            <input
              type="text"
              placeholder="15–20 March, this weekend..."
              value={dates}
              onChange={(e) => setDates(e.target.value)}
              disabled={flexible}
              className={`${styles.input} ${
                flexible ? styles.inputDisabled : ""
              }`}
            />
          </label>

          <label className={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={flexible}
              onChange={(e) => setFlexible(e.target.checked)}
            />
            <span>I'm flexible on dates</span>
          </label>

          <div className={styles.groupSection}>
            <span className={styles.labelText}>Who’s traveling?</span>
            <div className={styles.chipRow}>
              {(["solo", "couple", "family", "group"] as const).map((g) => {
                const active = groupType === g;
                return (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGroupType(g)}
                    className={`${styles.chip} ${
                      active ? styles.chipActive : ""
                    }`}
                  >
                    {g[0].toUpperCase() + g.slice(1)}
                  </button>
                );
              })}
            </div>
          </div>

          {error && (
            <p
              style={{
                color: "#f87171",
                fontSize: 12,
                marginTop: 6,
                marginBottom: -4,
              }}
            >
              {error}
            </p>
          )}

          <div className={styles.actions}>
            <button
              type="button"
              onClick={() => router.push("/")}
              className={styles.btnCancel}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={styles.btnPrimary}
              disabled={loading}
            >
              {loading ? "Planning your trip..." : "Start planning"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
