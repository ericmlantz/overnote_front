#import <Foundation/Foundation.h>
#import <AppKit/AppKit.h>
#import <CoreGraphics/CoreGraphics.h>

// Fetch active tab URL from supported browsers via AppleScript
NSString* getBrowserURL(NSString *bundleId) {
    NSString *scriptSource = nil;

    if ([bundleId isEqualToString:@"com.google.Chrome"]) {
        scriptSource = @"tell application \"Google Chrome\" to get URL of active tab of front window";
    } else if ([bundleId isEqualToString:@"com.apple.Safari"]) {
        scriptSource = @"tell application \"Safari\" to get URL of front document";
    } else if ([bundleId isEqualToString:@"company.thebrowser.Browser"] || [bundleId isEqualToString:@"co.thebrowser.Browser"]) {
        scriptSource = @"tell application \"Arc\" to get URL of active tab of front window";
    }

    if (scriptSource) {
        NSAppleScript *script = [[NSAppleScript alloc] initWithSource:scriptSource];
        NSDictionary *errorDict = nil;
        NSAppleEventDescriptor *result = [script executeAndReturnError:&errorDict];
        if (result && [result stringValue]) {
            return [result stringValue];
        }
    }

    return nil;
}

int main(int argc, const char * argv[]) {
    @autoreleasepool {
        NSRunningApplication *frontmostApp = [[NSWorkspace sharedWorkspace] frontmostApplication];

        NSString *appName = frontmostApp.localizedName ?: @"";
        NSString *bundleId = frontmostApp.bundleIdentifier ?: @"";
        pid_t pid = frontmostApp.processIdentifier;

        // Get the window title by matching PID with CGWindowList
        NSArray *windowList = (__bridge_transfer NSArray *)CGWindowListCopyWindowInfo(
            kCGWindowListOptionOnScreenOnly, kCGNullWindowID);

        NSString *windowTitle = @"";

        for (NSDictionary *window in windowList) {
            pid_t windowPID = [window[(id)kCGWindowOwnerPID] intValue];
            if (windowPID == pid) {
                NSString *title = window[(id)kCGWindowName];
                if (title.length > 0) {
                    windowTitle = title;
                    break;
                }
            }
        }

        NSString *url = getBrowserURL(bundleId);

        NSDictionary *result = @{
            @"title": windowTitle ?: @"",
            @"name": appName ?: @"",
            @"bundleId": bundleId ?: @"",
            @"pid": @(pid),
            @"url": url ?: @""
        };

        NSError *error;
        NSData *jsonData = [NSJSONSerialization dataWithJSONObject:result options:0 error:&error];

        if (!jsonData) {
            fprintf(stderr, "Failed to serialize JSON: %s\n", error.localizedDescription.UTF8String);
            return 1;
        }

        fwrite(jsonData.bytes, 1, jsonData.length, stdout);
    }
    return 0;
}