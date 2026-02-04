"use client";

import { useRouter } from "next/navigation";
import styles from "../styles/Header.module.css";

export default function Header() {
  const router = useRouter();

  const handleClick = () => {
    router.push("/trip-setup"); 
  };
  return (
    <header className={styles.header}>
      <div className={styles.logo}>TravelAI</div>
      <nav className={styles.nav} />
      <button className={styles.cta} onClick={handleClick}>
        Start Planning Now ➔
      </button>
    </header>
  );
}

