import React, { useEffect, useState } from 'react';
import { animate, useReducedMotion } from 'motion/react';

interface AnimatedNumberProps {
  value: number;
  /** Ondalık basamak sayısı */
  decimals?: number;
  className?: string;
  prefix?: string;
  suffix?: string;
}

/**
 * Sayısal değerlerde count-up. prefers-reduced-motion açıkken
 * animasyon atlanır ve nihai değer anında yazılır.
 */
export const AnimatedNumber: React.FC<AnimatedNumberProps> = ({
  value,
  decimals = 0,
  className = '',
  prefix = '',
  suffix = '',
}) => {
  const reduceMotion = useReducedMotion();
  const [display, setDisplay] = useState(reduceMotion ? value : 0);

  useEffect(() => {
    if (reduceMotion) {
      setDisplay(value);
      return;
    }
    const controls = animate(0, value, {
      duration: 0.32,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (latest) => setDisplay(latest),
    });
    return () => controls.stop();
  }, [value, reduceMotion]);

  return (
    <span className={`tnum ${className}`}>
      {prefix}
      {display.toLocaleString('tr-TR', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
      {suffix}
    </span>
  );
};
