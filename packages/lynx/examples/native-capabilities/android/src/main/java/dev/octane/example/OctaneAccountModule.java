package dev.octane.example;

import com.lynx.jsbridge.LynxMethod;
import com.lynx.jsbridge.LynxNativeModule;
import com.lynx.tasm.behavior.LynxContext;
import dev.octane.example.generated.OctaneAccountModuleSpec;

/** Application-owned module; Octane does not package or register this class. */
@LynxNativeModule(name = "OctaneAccountModule")
public final class OctaneAccountModule extends OctaneAccountModuleSpec {
  public OctaneAccountModule(LynxContext context) {
    super(context);
  }

  @Override
  @LynxMethod
  public String greeting(String accountId) {
    return "Hello " + accountId + " from Android";
  }
}
