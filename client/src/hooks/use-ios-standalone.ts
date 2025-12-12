import { useState, useEffect } from "react";

interface IOSStandaloneInfo {
  isIOS: boolean;
  isStandalone: boolean;
  isIOSPWA: boolean;
  shouldHidePayments: boolean;
}

export function useIOSStandalone(): IOSStandaloneInfo {
  const [info, setInfo] = useState<IOSStandaloneInfo>({
    isIOS: false,
    isStandalone: false,
    isIOSPWA: false,
    shouldHidePayments: false,
  });

  useEffect(() => {
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    const isIPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
    const isIOS = isIOSDevice || isIPadOS;
    
    const isStandalone = 
      (window.matchMedia('(display-mode: standalone)').matches) ||
      ((window.navigator as any).standalone === true);
    
    const isIOSPWA = isIOS && isStandalone;
    
    const hidePaymentsOnIOS = import.meta.env.VITE_HIDE_IOS_PAYMENTS === 'true';
    const shouldHidePayments = isIOSPWA && hidePaymentsOnIOS;

    setInfo({
      isIOS,
      isStandalone,
      isIOSPWA,
      shouldHidePayments,
    });
  }, []);

  return info;
}
