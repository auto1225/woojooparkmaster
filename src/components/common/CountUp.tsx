import { useEffect, useState, useRef } from "react";

interface CountUpProps {
  end: number;
  duration?: number;
  separator?: string;
  suffix?: string;
  className?: string;
}

export function CountUp({ end, duration = 800, separator = ",", suffix = "", className }: CountUpProps) {
  const [value, setValue] = useState(0);
  const startTime = useRef<number>(0);
  const raf = useRef<number>(0);

  useEffect(() => {
    startTime.current = performance.now();
    const animate = (now: number) => {
      const elapsed = now - startTime.current;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      setValue(Math.round(eased * end));
      if (progress < 1) raf.current = requestAnimationFrame(animate);
    };
    raf.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf.current);
  }, [end, duration]);

  const formatted = value.toLocaleString();
  return <span className={className}>{formatted}{suffix}</span>;
}
