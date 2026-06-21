/// <reference types="vite/client" />

declare namespace JSX {
  interface IntrinsicElements {
    webview: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
      src?: string
      preload?: string
      partition?: string
      width?: number | string
      height?: number | string
      allowpopups?: string
      webpreferences?: string
    }
  }
}
