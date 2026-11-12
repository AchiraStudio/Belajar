import { MotionConfig } from 'motion/react';
import { Footer } from './components/layout/Footer';
import { Header } from './components/layout/Header';
import { ScrollStalk } from './components/layout/ScrollStalk';
import { Closing } from './components/sections/Closing';
import { Games } from './components/sections/games/Games';
import { Hero } from './components/sections/Hero';
import { Honest } from './components/sections/Honest';
import { Language } from './components/sections/Language';
import { Limits } from './components/sections/Limits';
import { Loop } from './components/sections/loop/Loop';
import { PhoneSection } from './components/sections/phone/PhoneSection';
import { Privacy } from './components/sections/Privacy';
import { Run } from './components/sections/Run';

export default function App() {
  return (
    // reducedMotion="user": with the OS setting on, transform and layout animations are skipped
    // and only opacity changes remain, so nothing slides but every state still fades in.
    <MotionConfig reducedMotion="user">
      <a className="skip" href="#main">Skip to content</a>
      <ScrollStalk />
      <Header />
      <main id="main">
        <Hero />
        <Loop />
        <Games />
        <Honest />
        <Language />
        <PhoneSection />
        <Run />
        <Privacy />
        <Limits />
        <Closing />
      </main>
      <Footer />
    </MotionConfig>
  );
}
