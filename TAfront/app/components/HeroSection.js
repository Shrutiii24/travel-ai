import styles from '../styles/HeroSection.module.css';

export default function HeroSection() {
  return (
    <section className={styles.hero} style={{ position: 'relative', overflow: 'hidden' }}>
      <div className={styles.content}>
        <h1>
          <span className={styles.smarter}>Smarter travel</span>
          <span className={styles.starts}> starts here.</span>
        </h1>
        <p>TravelAI helps you find flight deals, hotels, and personalized trip ideas – all in one chat.</p>
      </div>
    </section>
  );
}
