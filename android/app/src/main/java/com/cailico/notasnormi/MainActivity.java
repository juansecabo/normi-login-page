package com.cailico.notasnormi;

import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    // Android 15/16 obliga a dibujar de borde a borde. En un WebView, ni el
    // safe-area de CSS ni el padding sirven para la barra de estado/navegación;
    // la forma infalible es mover físicamente el WebView con MÁRGENES iguales al
    // alto de esas barras, dejando el fondo (blanco) detrás de ellas.
    final View web = getBridge().getWebView();
    web.setBackgroundColor(Color.WHITE);
    ViewCompat.setOnApplyWindowInsetsListener(web, (v, insets) -> {
      Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
      ViewGroup.LayoutParams lp = v.getLayoutParams();
      if (lp instanceof ViewGroup.MarginLayoutParams) {
        ViewGroup.MarginLayoutParams mlp = (ViewGroup.MarginLayoutParams) lp;
        mlp.leftMargin = bars.left;
        mlp.topMargin = bars.top;
        mlp.rightMargin = bars.right;
        mlp.bottomMargin = bars.bottom;
        v.setLayoutParams(mlp);
      }
      return insets;
    });
    ViewCompat.requestApplyInsets(web);

    // Franjas blancas detrás de las barras → iconos oscuros para que se lean.
    WindowInsetsControllerCompat controller =
        ViewCompat.getWindowInsetsController(getWindow().getDecorView());
    if (controller != null) {
      controller.setAppearanceLightStatusBars(true);
      controller.setAppearanceLightNavigationBars(true);
    }
  }
}
