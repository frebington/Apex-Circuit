import type {
  CarChassisId,
  ClientWsMessage,
  PaintFinishId,
  RoomSnapshot,
  ServerWsMessage,
  TrackId,
  WeatherMode,
} from '../shared/types';

export interface MultiplayerCallbacks {
  onWelcome: (playerId: string, room: RoomSnapshot) => void;
  onRoomState: (room: RoomSnapshot) => void;
  onWorldSnapshot: (msg: Extract<ServerWsMessage, { type: 'world_snapshot' }>) => void;
  onConnectionChange: (connected: boolean) => void;
}

export class MultiplayerClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private disposed = false;
  private callbacks: MultiplayerCallbacks;
  private lastJoin: {
    roomId: string;
    name: string;
    color: string;
    chassisId?: CarChassisId;
    paintFinish?: PaintFinishId;
    trackId?: TrackId;
    weatherMode?: WeatherMode;
    cpuCount?: number;
    cpuDifficulty?: number;
  } = {
    roomId: 'OPEN-01',
    name: 'Driver',
    color: '#dc2626',
    chassisId: 'gt_coupe',
    paintFinish: 'gloss',
  };

  constructor(callbacks: MultiplayerCallbacks) {
    this.callbacks = callbacks;
  }

  public connect(initialJoin: {
    roomId: string;
    name: string;
    color: string;
    chassisId?: CarChassisId;
    paintFinish?: PaintFinishId;
    trackId?: TrackId;
    weatherMode?: WeatherMode;
    cpuCount?: number;
    cpuDifficulty?: number;
  }): void {
    this.lastJoin = { ...initialJoin };
    this.openSocket();
  }

  private openSocket(): void {
    if (this.disposed) return;
    if (
      typeof window === 'undefined' ||
      window.location.protocol === 'file:' ||
      !window.location.host
    ) {
      this.callbacks.onConnectionChange(false);
      return;
    }
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/ws`;

    try {
      const ws = new WebSocket(url);
      this.ws = ws;

      ws.onopen = () => {
        this.callbacks.onConnectionChange(true);
        this.send({
          type: 'join_room',
          roomId: this.lastJoin.roomId,
          name: this.lastJoin.name,
          color: this.lastJoin.color,
          chassisId: this.lastJoin.chassisId,
          paintFinish: this.lastJoin.paintFinish,
          trackId: this.lastJoin.trackId,
          weatherMode: this.lastJoin.weatherMode,
          cpuCount: this.lastJoin.cpuCount,
          cpuDifficulty: this.lastJoin.cpuDifficulty,
        });
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(String(event.data)) as ServerWsMessage;
          if (msg.type === 'welcome') {
            this.callbacks.onWelcome(msg.playerId, msg.room);
          } else if (msg.type === 'room_state') {
            this.callbacks.onRoomState(msg.room);
          } else if (msg.type === 'world_snapshot') {
            this.callbacks.onWorldSnapshot(msg);
          }
        } catch {
          // Ignore malformed message
        }
      };

      ws.onclose = () => {
        this.callbacks.onConnectionChange(false);
        this.ws = null;
        if (!this.disposed) {
          this.reconnectTimer = window.setTimeout(() => this.openSocket(), 1500);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch {
      if (!this.disposed) {
        this.reconnectTimer = window.setTimeout(() => this.openSocket(), 2000);
      }
    }
  }

  public joinRoom(
    roomId: string,
    name: string,
    color: string,
    trackId?: TrackId,
    weatherMode?: WeatherMode,
    chassisId?: CarChassisId,
    paintFinish?: PaintFinishId,
    cpuCount?: number,
    cpuDifficulty?: number,
  ): void {
    this.lastJoin = {
      roomId,
      name,
      color,
      trackId,
      weatherMode,
      chassisId,
      paintFinish,
      cpuCount,
      cpuDifficulty,
    };
    this.send({
      type: 'join_room',
      roomId,
      name,
      color,
      trackId,
      weatherMode,
      chassisId,
      paintFinish,
      cpuCount,
      cpuDifficulty,
    });
  }

  public updateProfile(
    name: string,
    color: string,
    chassisId?: CarChassisId,
    paintFinish?: PaintFinishId,
  ): void {
    this.lastJoin.name = name;
    this.lastJoin.color = color;
    if (chassisId) this.lastJoin.chassisId = chassisId;
    if (paintFinish) this.lastJoin.paintFinish = paintFinish;
    this.send({ type: 'update_profile', name, color, chassisId, paintFinish });
  }

  public selectTrack(trackId: TrackId): void {
    this.lastJoin.trackId = trackId;
    this.send({ type: 'select_track', trackId });
  }

  public selectWeather(weatherMode: WeatherMode): void {
    this.lastJoin.weatherMode = weatherMode;
    this.send({ type: 'select_weather', weatherMode });
  }

  public selectCpuSettings(cpuCount: number, cpuDifficulty: number): void {
    this.lastJoin.cpuCount = cpuCount;
    this.lastJoin.cpuDifficulty = cpuDifficulty;
    this.send({ type: 'select_cpu_settings', cpuCount, cpuDifficulty });
  }

  public startRace(): void {
    this.send({ type: 'start_race' });
  }

  public returnLobby(): void {
    this.send({ type: 'return_lobby' });
  }

  public sendCarState(state: Omit<Extract<ClientWsMessage, { type: 'car_state' }>, 'type'>): void {
    this.send({ type: 'car_state', ...state });
  }

  private send(msg: ClientWsMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  public dispose(): void {
    this.disposed = true;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
