// nucleo icons (ui, core, social sets), strokes swapped to currentColor
type P = { className?: string; size?: number };

export function Check({ className, size = 14 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" className={className} fill="none">
      <path d="m1.76,7.004l2.25,3L10.24,1.746" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
    </svg>
  );
}

export function Play({ className, size = 16 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" className={className} fill="currentColor">
      <path d="m7.724,5.482l-2.308-1.385c-.403-.242-.916.048-.916.518v2.771c0,.47.513.76.916.518l2.308-1.385c.391-.235.391-.802,0-1.037Z" />
      <path d="m6,.75c2.899,0,5.25,2.35,5.25,5.25,0,2.899-2.35,5.25-5.25,5.25" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
      <circle cx=".75" cy="6" r=".75" />
      <circle cx="1.453" cy="3.375" r=".75" />
      <circle cx="3.375" cy="1.453" r=".75" />
      <circle cx="1.453" cy="8.625" r=".75" />
      <circle cx="3.375" cy="10.547" r=".75" />
    </svg>
  );
}

export function Chevron({ className, size = 12 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" className={className} fill="none">
      <polyline points="1.75 4.25 6 8.5 10.25 4.25" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
    </svg>
  );
}

export function Plus({ className, size = 12 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5">
      <line x1="10.75" y1="6" x2="1.25" y2="6" />
      <line x1="6" y1="10.75" x2="6" y2="1.25" />
    </svg>
  );
}

export function Fingerprint({ className, size = 18 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5">
      <path d="M5.078,3.462c1.052-.911,2.424-1.462,3.922-1.462,3.309,0,6,2.691,6,6,0,2.307-.363,4.373-.988,6.213" />
      <path d="M1.908,11.703c1.04-1.692,1.092-3.383,1.092-3.703,0-.912,.204-1.777,.57-2.552" />
      <path d="M11.87,10.142c-.278,2.234-.983,4.16-1.951,5.806" />
      <path d="M3.872,14.14c1.224-1.479,2.128-3.474,2.128-6.14,0-1.657,1.343-3,3-3,1.524,0,2.783,1.137,2.975,2.608" />
      <path d="M6.551,15.618c1.424-1.874,2.449-4.356,2.449-7.618" />
    </svg>
  );
}

export function Shield({ className, size = 18 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5">
      <path d="M9.305,1.848l5.25,1.68c.414,.133,.695,.518,.695,.952v6.52c0,3.03-4.684,4.748-5.942,5.155-.203,.066-.413,.066-.616,0-1.258-.407-5.942-2.125-5.942-5.155V4.48c0-.435,.281-.82,.695-.952l5.25-1.68c.198-.063,.411-.063,.61,0Z" />
      <polyline points="6.497 9.75 8.106 11.25 11.503 6.75" />
    </svg>
  );
}

export function Bolt({ className, size = 16 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" className={className} fill="none">
      <polygon points="11 2.5 10.5 8 16 8 9 17.5 9.5 12 4 12 11 2.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  );
}

export function XLogo({ className, size = 16 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} fill="currentColor">
      <path d="M18.42,14.009L27.891,3h-2.244l-8.224,9.559L10.855,3H3.28l9.932,14.455L3.28,29h2.244l8.684-10.095,6.936,10.095h7.576l-10.301-14.991h0Zm-3.074,3.573l-1.006-1.439L6.333,4.69h3.447l6.462,9.243,1.006,1.439,8.4,12.015h-3.447l-6.854-9.804h0Z" />
    </svg>
  );
}

export function Android({ className, size = 18 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} fill="currentColor">
      <path d="M23.364,18.448c-.736,0-1.333-.595-1.333-1.33,0-.735,.596-1.33,1.332-1.331s1.333,.595,1.333,1.33c0,.734-.597,1.33-1.332,1.331m-14.728,0c-.736,0-1.333-.595-1.333-1.33s.596-1.33,1.332-1.331c.736,0,1.333,.595,1.333,1.33,0,.734-.597,1.33-1.332,1.331m15.206-8.013l2.663-4.605c.153-.265,.063-.603-.202-.756-.265-.153-.604-.062-.757,.202h0l-2.697,4.663c-2.062-.94-4.378-1.463-6.849-1.463s-4.787,.524-6.849,1.463l-2.696-4.663c-.153-.265-.492-.355-.757-.203-.265,.153-.356,.491-.203,.756h0l2.663,4.605C3.585,12.918,.458,17.54,0,23H32c-.458-5.46-3.585-10.082-8.158-12.565" />
    </svg>
  );
}
