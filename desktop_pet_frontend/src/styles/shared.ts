import { css } from 'lit';

/**
 * Material 3 Expressive shared styles for Lit components
 */
export const m3Shared = css`
  :host {
    font-family: var(--md-sys-typescale-body-font);
    color: var(--md-sys-color-on-surface);
  }

  /* Material Symbols - must be declared inside Shadow DOM */
  .material-symbols-outlined {
    font-family: 'Material Symbols Outlined';
    font-weight: normal;
    font-style: normal;
    font-size: 24px;
    line-height: 1;
    letter-spacing: normal;
    text-transform: none;
    display: inline-block;
    white-space: nowrap;
    word-wrap: normal;
    direction: ltr;
    -webkit-font-feature-settings: 'liga';
    -webkit-font-smoothing: antialiased;
    font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
  }

  /* Elevation surfaces */
  .surface { background: var(--md-sys-color-surface); }
  .surface-container { background: var(--md-sys-color-surface-container); }
  .surface-container-low { background: var(--md-sys-color-surface-container-low); }
  .surface-container-high { background: var(--md-sys-color-surface-container-high); }
  .surface-container-highest { background: var(--md-sys-color-surface-container-highest); }

  .elevation-1 { box-shadow: var(--md-sys-elevation-1); }
  .elevation-2 { box-shadow: var(--md-sys-elevation-2); }
  .elevation-3 { box-shadow: var(--md-sys-elevation-3); }

  /* Shape */
  .shape-small { border-radius: var(--md-sys-shape-corner-small); }
  .shape-medium { border-radius: var(--md-sys-shape-corner-medium); }
  .shape-large { border-radius: var(--md-sys-shape-corner-large); }
  .shape-extra-large { border-radius: var(--md-sys-shape-corner-extra-large); }
  .shape-full { border-radius: var(--md-sys-shape-corner-full); }

  /* Typography */
  .display-large { font-size: 57px; line-height: 64px; font-weight: 400; }
  .display-medium { font-size: 45px; line-height: 52px; font-weight: 400; }
  .display-small { font-size: 36px; line-height: 44px; font-weight: 400; }
  .headline-large { font-size: 32px; line-height: 40px; font-weight: 400; }
  .headline-medium { font-size: 28px; line-height: 36px; font-weight: 400; }
  .headline-small { font-size: 24px; line-height: 32px; font-weight: 400; }
  .title-large { font-size: 22px; line-height: 28px; font-weight: 500; }
  .title-medium { font-size: 16px; line-height: 24px; font-weight: 500; }
  .title-small { font-size: 14px; line-height: 20px; font-weight: 500; }
  .body-large { font-size: 16px; line-height: 24px; font-weight: 400; }
  .body-medium { font-size: 14px; line-height: 20px; font-weight: 400; }
  .body-small { font-size: 12px; line-height: 16px; font-weight: 400; }
  .label-large { font-size: 14px; line-height: 20px; font-weight: 500; }
  .label-medium { font-size: 12px; line-height: 16px; font-weight: 500; }
  .label-small { font-size: 11px; line-height: 16px; font-weight: 500; }

  /* Motion - Expressive */
  .motion-standard {
    transition-timing-function: var(--md-sys-motion-easing-standard);
    transition-duration: var(--md-sys-motion-duration-medium);
  }
  .motion-emphasized {
    transition-timing-function: var(--md-sys-motion-easing-emphasized);
    transition-duration: var(--md-sys-motion-duration-long);
  }
`;

/**
 * Card base styles
 */
export const cardStyles = css`
  .card {
    background: var(--md-sys-color-surface-container-low);
    border-radius: var(--md-sys-shape-corner-medium);
    padding: 16px;
    transition: box-shadow var(--md-sys-motion-duration-medium) var(--md-sys-motion-easing-standard),
                transform var(--md-sys-motion-duration-medium) var(--md-sys-motion-easing-standard);
  }
  .card:hover {
    box-shadow: var(--md-sys-elevation-1);
  }
  .card-elevated {
    background: var(--md-sys-color-surface-container-low);
    border-radius: var(--md-sys-shape-corner-medium);
    box-shadow: var(--md-sys-elevation-1);
    padding: 16px;
  }
  .card-filled {
    background: var(--md-sys-color-surface-container-highest);
    border-radius: var(--md-sys-shape-corner-medium);
    padding: 16px;
  }
  .card-outlined {
    background: var(--md-sys-color-surface);
    border: 1px solid var(--md-sys-color-outline-variant);
    border-radius: var(--md-sys-shape-corner-medium);
    padding: 16px;
  }
`;

/**
 * M3 Expressive scrollbar styles — apply to any scrollable host/container
 */
export const m3Scrollbar = css`
  :host::-webkit-scrollbar {
    width: 6px;
  }
  :host::-webkit-scrollbar-track {
    background: transparent;
    margin: 4px 0;
  }
  :host::-webkit-scrollbar-thumb {
    background: var(--md-sys-color-on-surface-variant, #c3c8bb);
    border-radius: 100px;
    opacity: 0.5;
  }
  :host::-webkit-scrollbar-thumb:hover {
    background: var(--md-sys-color-on-surface, #e2e3da);
  }
  :host::-webkit-scrollbar-corner {
    background: transparent;
  }
`;
