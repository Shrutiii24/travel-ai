import React, { useMemo, useState } from "react";
import { HotelOption } from "../results/types/travel";

type Props = {
  hotels: HotelOption[];
};

export const HotelResultsCard: React.FC<Props> = ({ hotels }) => {
  const [sortKey, setSortKey] = useState<"price" | "rating">("price");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [minRating, setMinRating] = useState(0);

  const sortedHotels = useMemo(() => {
    let list = [...hotels];

    if (minRating > 0) {
      list = list.filter((h) => (h.overall_rating ?? 0) >= minRating);
    }

    list.sort((a, b) => {
      if (sortKey === "price") {
        const pa = parseFloat(String(a.night_price ?? 0).toString().replace(/[^0-9.]/g, ""));
        const pb = parseFloat(String(b.night_price ?? 0).toString().replace(/[^0-9.]/g, ""));
        return sortDir === "asc" ? pa - pb : pb - pa;
      }
      if (sortKey === "rating") {
        const ra = a.overall_rating ?? 0;
        const rb = b.overall_rating ?? 0;
        return sortDir === "asc" ? ra - rb : rb - ra;
      }
      return 0;
    });

    return list;
  }, [hotels, sortKey, sortDir, minRating]);

  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  if (!hotels.length) return null;

  return (
    <div className="rounded-xl bg-white/90 shadow-md p-4 mt-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">Hotel options</h2>
        <div className="flex items-center gap-3 text-sm">
          <label className="flex items-center gap-1">
            Min rating:
            <select
              value={minRating}
              onChange={(e) => setMinRating(Number(e.target.value))}
              className="border rounded px-1 py-0.5 text-sm"
            >
              <option value={0}>Any</option>
              <option value={3}>3+</option>
              <option value={4}>4+</option>
              <option value={4.5}>4.5+</option>
            </select>
          </label>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b">
              <th className="py-2 px-2 text-left">Hotel</th>
              <th
                className="py-2 px-2 text-left cursor-pointer"
                onClick={() => toggleSort("rating")}
              >
                Rating {sortKey === "rating" ? (sortDir === "asc" ? "↑" : "↓") : ""}
              </th>
              <th
                className="py-2 px-2 text-left cursor-pointer"
                onClick={() => toggleSort("price")}
              >
                Night price {sortKey === "price" ? (sortDir === "asc" ? "↑" : "↓") : ""}
              </th>
              <th className="py-2 px-2 text-left">Reviews</th>
              <th className="py-2 px-2 text-left">Book</th>
            </tr>
          </thead>
          <tbody>
            {sortedHotels.map((h) => (
              <tr key={h.name + String(h.link)} className="border-b last:border-0">
                <td className="py-2 px-2">{h.name}</td>
                <td className="py-2 px-2">{h.overall_rating ?? "—"}</td>
                <td className="py-2 px-2">
                  {h.night_price ? String(h.night_price) : "—"}
                </td>
                <td className="py-2 px-2">{h.reviews_count ?? "—"}</td>
                <td className="py-2 px-2">
                  {h.link ? (
                    <a
                      href={h.link}
                      target="_blank"
                      rel="noreferrer"
                      className="text-purple-600 hover:underline"
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
  );
};
