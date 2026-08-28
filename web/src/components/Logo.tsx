import Image from 'next/image';

export function Logo({ size = 48, className = '' }: { size?: number; className?: string }) {
  return (
    <Image
      src="/logo.png"
      alt="agent-usage"
      width={size}
      height={size}
      className={`rounded-full ring-2 ring-amber-400/30 shadow-lg shadow-teal-500/10 ${className}`}
      priority
    />
  );
}

export function LogoMark({ size = 40, className = '' }: { size?: number; className?: string }) {
  return (
    <Image
      src="/logo.png"
      alt=""
      width={size}
      height={size}
      className={className}
      priority
    />
  );
}
