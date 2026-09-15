import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Notas Normi como app de tienda (Google Play / App Store).
 *
 * La app es un cascarón nativo que carga la misma página de producción
 * (notasnormi.com). Así, cada deploy del frontend se ve en la app al
 * instante, sin volver a publicar en las tiendas. Solo hay que republicar
 * cuando cambie este cascarón (ícono, permisos, versión mínima, plugins).
 */
const config: CapacitorConfig = {
  appId: "com.cailico.notasnormi",
  appName: "Notas Normi",
  webDir: "dist",
  server: {
    // Carga la plataforma en vivo. Sin esto, la app usaría la copia empaquetada
    // en `dist` y habría que republicar en la tienda por cada cambio.
    url: "https://notasnormi.com",
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
    // Color de la barra de estado y fondo mientras carga (verde de la marca).
    backgroundColor: "#2D6A4F",
  },
  ios: {
    contentInset: "automatic",
    backgroundColor: "#2D6A4F",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: "#2D6A4F",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
    },
  },
};

export default config;
