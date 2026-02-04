import Header from './components/Header';
import HeroSection from './components/HeroSection';
import SearchBox from './components/SearchBox';
import FeatureButtons from './components/FeatureButtons';
import Footer from './components/Footer';

export default function Home() {
  return (
    <>
      <video
        autoPlay
        muted
        loop
        playsInline
        className="backgroundVideo"
      >
        <source src="/9431944-uhd_2560_1440_24fps.mp4" type="video/mp4" />
        Your browser does not support the video tag.
      </video>
      <Header />
      <HeroSection />
      <SearchBox />
      <FeatureButtons />
      <Footer />
    </>
  );
}
