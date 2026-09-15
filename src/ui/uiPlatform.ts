const MOBILE_USER_AGENT = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;

export function usesMobileLayout(): boolean {
  return navigator.maxTouchPoints > 0
    || MOBILE_USER_AGENT.test(navigator.userAgent)
    || window.innerWidth <= 1024
    || window.innerHeight <= 500;
}
