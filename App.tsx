import React, { useState } from "react";
import SplashScreen from "./SplashScreen";
import RootLayout from "./app/_layout"; // your actual app

export default function App() {
  const [ready, setReady] = useState(false);

  if (!ready) {
    return <SplashScreen onFinish={() => setReady(true)} />;
  }

  return <RootLayout />;
}
