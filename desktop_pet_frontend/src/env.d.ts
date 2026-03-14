/// <reference types="vite/client" />

declare module 'pixi-live2d-display' {
  export class Live2DModel {
    static from(url: string, options?: Record<string, unknown>): Promise<Live2DModel>;
    motion(group: string, index?: number): Promise<boolean>;
    expression(index?: number): Promise<boolean>;
    destroy(): void;

    // Inherited from PIXI.Container / DisplayObject
    x: number;
    y: number;
    width: number;
    height: number;
    interactive: boolean;
    cursor: string;
    scale: { x: number; y: number; set(x: number, y?: number): void };
    anchor: { set(x: number, y?: number): void };
    on(event: string, fn: (...args: any[]) => void): void;
    off(event: string, fn: (...args: any[]) => void): void;

    internalModel: {
      motionManager: {
        expressionManager?: {
          expressions: Array<{ name: string }>;
        };
        motionGroups: Record<string, unknown[]>;
      };
    };
  }

  export class Live2DFactory {
    static registerTicker(ticker: unknown): void;
  }

  export class MotionPreloadStrategy {}
  export class InternalModel {}
}
