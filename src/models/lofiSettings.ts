export default interface LofiSettings {
  version: string;
  debug: boolean;
  hardware_acceleration: boolean;
  access_token: string;
  refresh_token: string;
  lofi: {
    visualization: number;
    window: {
      always_on_top: boolean;
      show_in_taskbar: boolean;
      x: number;
      y: number;
      hide: boolean;
      metadata: boolean;
      show_progress: boolean;
      bar_thickness: number;
      scale: number;
      side: number;
    };
    audio: {
      volume_increment: number;
      display_volume_change: boolean;
    };
  };
}
