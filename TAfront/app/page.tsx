"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Header from "./components/Header";
import HeroSection from "./components/HeroSection";
import SearchBox from "./components/SearchBox";
import FeatureButtons from "./components/FeatureButtons";
import Footer from "./components/Footer";

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleSearch = (query: string) => {
    if (!query.trim() || loading) return;

    setLoading(true);
    const params = new URLSearchParams({ q: query.trim() });
    router.push(`/results?${params.toString()}`);
    setLoading(false);
  };
  return (
    <>
      <Header />
      <HeroSection />
      <SearchBox onSubmit={handleSearch} loading={loading} />
      <FeatureButtons />
      <Footer />
    </>
  );
}
