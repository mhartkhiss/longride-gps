/**
 * Screen Wake Lock utility to keep mobile devices from sleeping during an active ride.
 * This prevents mobile browsers (Chrome / Safari) from throttling Geolocation
 * and WebSocket connections when screen idle timeouts fire.
 */

class ScreenWakeLockManager {
  private sentinel: any = null;
  private isRequested = false;

  private handleVisibilityChange = async () => {
    if (this.isRequested && document.visibilityState === 'visible') {
      await this.acquire();
    }
  };

  /**
   * Requests a screen wake lock if supported by the browser.
   */
  async acquire(): Promise<boolean> {
    this.isRequested = true;

    if (typeof window === 'undefined' || !('wakeLock' in navigator)) {
      return false;
    }

    try {
      if (this.sentinel && !this.sentinel.released) {
        return true;
      }

      this.sentinel = await (navigator as any).wakeLock.request('screen');
      this.sentinel.addEventListener('release', () => {
        this.sentinel = null;
      });

      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
      return true;
    } catch (err) {
      console.warn('Screen WakeLock request failed:', err);
      return false;
    }
  }

  /**
   * Releases active screen wake lock.
   */
  async release(): Promise<void> {
    this.isRequested = false;
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);

    if (this.sentinel) {
      try {
        await this.sentinel.release();
      } catch (err) {
        console.warn('Screen WakeLock release error:', err);
      } finally {
        this.sentinel = null;
      }
    }
  }
}

export const screenWakeLock = new ScreenWakeLockManager();
