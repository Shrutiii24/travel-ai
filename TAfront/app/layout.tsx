import './styles/globals.css';
import Script from 'next/script';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
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
        {children}
      </body>
    </html>
  );
}

