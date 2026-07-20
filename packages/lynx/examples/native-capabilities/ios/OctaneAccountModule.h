#import <Foundation/Foundation.h>
#import <Lynx/LynxModule.h>
#import "generated/OctaneAccountModuleSpec.h"

NS_ASSUME_NONNULL_BEGIN

/** Application-owned module; Octane does not package or register this class. */
@LynxNativeModule("OctaneAccountModule")
@interface OctaneAccountModule : NSObject <OctaneAccountModuleSpec>
@end

NS_ASSUME_NONNULL_END
