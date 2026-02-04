"use client";

import { useState } from "react";
import styles from "../styles/SearchBox.module.css";

export default function SearchBox({ onSubmit, loading }) {
  const [query, setQuery] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    const clean = query.trim();
    if (!clean || loading) return;
    onSubmit(clean);
  };

  return (
    <form className={styles.searchBox} onSubmit={handleSubmit}>
      <input
        className={styles.input}
        placeholder="Flights from Delhi to Mumbai on 10 Feb, hotels in Goa 7–13 Feb"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        disabled={loading}
      />
      <button className={styles.button} type="submit" disabled={loading}>
        {loading ? "…" : "➔"}
      </button>
    </form>
  );
}





