/**
 * Responsive scaling utilities for consistent sizing across all screen sizes
 */

export interface ScreenSize {
  width: number;
  height: number;
  scale: number;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isLargeDesktop: boolean;
}

export function getScreenSize(): ScreenSize {
  const width = window.innerWidth;
  const height = window.innerHeight;

  // Define breakpoints
  const isMobile = width < 768;
  const isTablet = width >= 768 && width < 1024;
  const isDesktop = width >= 1024 && width < 1920;
  const isLargeDesktop = width >= 1920;

  // Calculate scale factor based on width
  // Base size is 1920px width
  let scale = 1;
  if (isMobile) {
    scale = Math.min(width / 768, 1);
  } else if (isTablet) {
    scale = width / 1024;
  } else if (isDesktop) {
    scale = width / 1440;
  } else {
    scale = Math.min(width / 1920, 1.5); // Cap at 1.5x for ultra-wide
  }

  return {
    width,
    height,
    scale,
    isMobile,
    isTablet,
    isDesktop,
    isLargeDesktop,
  };
}

export function getResponsiveValue<T>(values: {
  mobile?: T;
  tablet?: T;
  desktop?: T;
  largeDesktop?: T;
  default: T;
}): T {
  const screen = getScreenSize();

  if (screen.isMobile && values.mobile !== undefined) return values.mobile;
  if (screen.isTablet && values.tablet !== undefined) return values.tablet;
  if (screen.isDesktop && values.desktop !== undefined) return values.desktop;
  if (screen.isLargeDesktop && values.largeDesktop !== undefined) return values.largeDesktop;

  return values.default;
}

export function getScaledSize(baseSize: number): number {
  const screen = getScreenSize();
  return baseSize * screen.scale;
}

export function getCameraFOV(): number {
  return getResponsiveValue({
    mobile: 70,
    tablet: 60,
    desktop: 50,
    largeDesktop: 45,
    default: 50,
  });
}

export function getCameraDistance(): number {
  return getResponsiveValue({
    mobile: 25,
    tablet: 20,
    desktop: 15,
    largeDesktop: 12,
    default: 15,
  });
}
