import { motion } from "framer-motion/client";
import React, { useMemo, useState } from "react";
import { FlightOption } from "../results/types/travel";

type Props = {
  flights: FlightOption[];
};

export const FlightResultsCard: React.FC<Props> = ({ flights }) => {
  const [sortKey, setSortKey] = useState<"price" | "depart" | "stops">("price");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [nonStopOnly, setNonStopOnly] = useState(false);

  const sortedFlights = useMemo(() => {
    let list = [...flights];

    if (nonStopOnly) {
      list = list.filter((f) => f.stops === 0);
    }

    list.sort((a, b) => {
      if (sortKey === "price") {
        const pa = parseFloat(String(a.price_total).replace(/[^0-9.]/g, ""));
        const pb = parseFloat(String(b.price_total).replace(/[^0-9.]/g, ""));
        return sortDir === "asc" ? pa - pb : pb - pa;
      }
      if (sortKey === "depart") {
        const ta = new Date(a.departure_time).getTime();
        const tb = new Date(b.departure_time).getTime();
        return sortDir === "asc" ? ta - tb : tb - ta;
      }
      if (sortKey === "stops") {
        return sortDir === "asc" ? a.stops - b.stops : b.stops - a.stops;
      }
      return 0;
    });

    return list;
  }, [flights, sortKey, sortDir, nonStopOnly]);

  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  if (!flights.length) return null;

  return (
    <div className="rounded-xl bg-white/90 shadow-md p-4 mt-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">Flight options</h2>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={nonStopOnly}
            onChange={(e) => setNonStopOnly(e.target.checked)}
          />
          Non-stop only
        </label>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b">
              <th className="py-2 px-2 text-left">Airline</th>
              <th
                className="py-2 px-2 text-left cursor-pointer"
                onClick={() => toggleSort("depart")}
              >
                Depart {sortKey === "depart" ? (sortDir === "asc" ? "↑" : "↓") : ""}
              </th>
              <th className="py-2 px-2 text-left">Arrive</th>
              <th
                className="py-2 px-2 text-left cursor-pointer"
                onClick={() => toggleSort("stops")}
              >
                Stops {sortKey === "stops" ? (sortDir === "asc" ? "↑" : "↓") : ""}
              </th>
              <th
                className="py-2 px-2 text-left cursor-pointer"
                onClick={() => toggleSort("price")}
              >
                Price {sortKey === "price" ? (sortDir === "asc" ? "↑" : "↓") : ""}
              </th>
              <th className="py-2 px-2 text-left">Book</th>
            </tr>
          </thead>
          <tbody>
            {sortedFlights.map((f) => (
              <tr key={f.id} className="border-b last:border-0">
                <td className="py-2 px-2">{f.carrier_code || "—"}</td>
                <td className="py-2 px-2">{f.departure_time}</td>
                <td className="py-2 px-2">{f.arrival_time}</td>
                <td className="py-2 px-2">{f.stops === 0 ? "Non-stop" : `${f.stops} stop(s)`}</td>
                <td className="py-2 px-2">{f.price_total}</td>
                <td className="py-2 px-2">
                  <a
                    href="https://www.google.com/travel/flights"
                    target="_blank"
                    rel="noreferrer"
                    className="text-purple-600 hover:underline"
                  >
                    Book
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
