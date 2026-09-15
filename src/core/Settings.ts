export class Settings {
    public static get graphicsMode(): 'HIGH' | 'LOW' {
        const savedMode = localStorage.getItem('universe_gfx_mode') as 'HIGH' | 'LOW' | null;
        if (savedMode === 'HIGH' || savedMode === 'LOW') return savedMode;

        const isMobile = navigator.maxTouchPoints > 0 ||
            /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
            window.innerWidth <= 1024 ||
            window.innerHeight <= 500;

        return isMobile ? 'LOW' : 'HIGH';
    }

    public static set graphicsMode(mode: 'HIGH' | 'LOW') {
        localStorage.setItem('universe_gfx_mode', mode);
    }
}
