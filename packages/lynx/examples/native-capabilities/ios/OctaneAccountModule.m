#import "OctaneAccountModule.h"

@implementation OctaneAccountModule

+ (NSString *)name {
  return @"OctaneAccountModule";
}

+ (NSDictionary<NSString *, NSString *> *)methodLookup {
  return @{ @"greeting" : NSStringFromSelector(@selector(greeting:)) };
}

- (NSString *)greeting:(NSString *)accountId {
  return [NSString stringWithFormat:@"Hello %@ from iOS", accountId];
}

@end
