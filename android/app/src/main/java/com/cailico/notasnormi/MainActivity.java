package com.cailico.notasnormi;

import android.graphics.Color;
import android.os.Bundle;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    // Android 15/16 obliga a dibujar de borde a borde: sin esto el contenido web
    // (el encabezado) queda debajo de la barra de estado y de la barra de
    // navegación. Aplicamos como relleno el alto de esas barras al WebView.
    // Fondo blanco: la franja de las barras y la pantalla de carga se ven limpias.
    getBridge().getWebView().setBackgroundColor(Color.WHITE);
    ViewCompat.setOnApplyWindowInsetsListener(getBridge().getWebView(), (v, insets) -> {
      Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
      v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
      return insets;
    });
    // Fuerza el recálculo de los insets ahora (si no, el listener puede no
    // dispararse porque los insets ya se habían repartido durante el layout).
    ViewCompat.requestApplyInsets(getBridge().getWebView());

    // Franjas blancas → iconos oscuros para que se lean.
    WindowInsetsControllerCompat controller =
        ViewCompat.getWindowInsetsController(getWindow().getDecorView());
    if (controller != null) {
      controller.setAppearanceLightStatusBars(true);
      controller.setAppearanceLightNavigationBars(true);
    }
  }
}
