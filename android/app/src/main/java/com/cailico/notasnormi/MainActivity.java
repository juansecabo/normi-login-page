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
    // (el encabezado verde) queda debajo de la barra de estado y de la barra de
    // navegación. Aplicamos como relleno el alto de esas barras al WebView, para
    // que el contenido empiece justo debajo de la barra de estado.
    // Verde de marca detrás de las barras del sistema, para que la franja de la
    // barra de estado se una con el encabezado verde y los iconos blancos se lean.
    getBridge().getWebView().setBackgroundColor(Color.parseColor("#2D6A4F"));
    ViewCompat.setOnApplyWindowInsetsListener(getBridge().getWebView(), (v, insets) -> {
      Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
      v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
      return insets;
    });

    // La barra de estado va sobre el verde de marca: iconos claros (blancos).
    WindowInsetsControllerCompat controller =
        ViewCompat.getWindowInsetsController(getWindow().getDecorView());
    if (controller != null) {
      controller.setAppearanceLightStatusBars(false);
      controller.setAppearanceLightNavigationBars(false);
    }
  }
}
