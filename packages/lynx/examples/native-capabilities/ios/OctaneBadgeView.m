#import "OctaneBadgeView.h"
#import <Lynx/LynxPropsProcessor.h>

@LynxElement("octane-badge")
@implementation OctaneBadgeView

- (UILabel *)createView {
  return [[UILabel alloc] init];
}

LYNX_PROP_SETTER("label", setLabel, NSString *) {
  self.view.text = value;
}

@end
