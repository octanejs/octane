package dev.octane.example;

import android.content.Context;
import android.widget.TextView;
import com.lynx.tasm.behavior.LynxContext;
import com.lynx.tasm.behavior.LynxElement;
import com.lynx.tasm.behavior.LynxProp;
import com.lynx.tasm.behavior.ui.LynxUI;

/** Application-owned custom element; the host's Lynx registry owns it. */
@LynxElement(name = "octane-badge")
public final class OctaneBadgeView extends LynxUI<TextView> {
  public OctaneBadgeView(LynxContext context) {
    super(context);
  }

  @Override
  protected TextView createView(Context context) {
    return new TextView(context);
  }

  @LynxProp(name = "label")
  public void setLabel(String label) {
    if (mView != null) {
      mView.setText(label);
    }
  }
}
