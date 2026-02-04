import styles from '../styles/FeatureButtons.module.css';
const features = [
  {label: "Plan trip details"},
  {label: "Find cheap flights"},
  {label: "Book quality hotels"}
];
export default function FeatureButtons() {
  return (
    <div className={styles.features}>
      {features.map((f, i) =>
        <button key={i} className={styles.featureBtn}>{f.label}</button>
      )}
    </div>
  );
}
