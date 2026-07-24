"use client";

import { useEffect, useState } from "react";
import "./Greeting.css";

interface GreetingProps {
  userName: string;
}

const ROTATE_MS = 6000;

function buildVariants(userName: string): string[] {
  return [
    `How can I help, ${userName}?`,
    `Hey, ${userName}. Ready to dive in?`,
    `Welcome back, ${userName}.`,
    `What are we working on today, ${userName}?`,
    `Good to see you, ${userName}.`,
    `Where should we start, ${userName}?`,
  ];
}

function RotatingGreeting({ userName }: GreetingProps) {
  const variants = buildVariants(userName);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((current) => (current + 1) % variants.length);
    }, ROTATE_MS);
    return () => clearInterval(timer);
  }, [variants.length]);

  return (
    <h1 className="greeting" key={index}>
      {variants[index]}
    </h1>
  );
}

export default function Greeting({ userName }: GreetingProps) {
  return <RotatingGreeting key={userName} userName={userName} />;
}
