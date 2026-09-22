# source this in fish before running expo android builds: source scripts/android-env.fish
set -gx ANDROID_HOME $HOME/coding/hackathon/monad/tmp/claude/android-sdk
set -gx ANDROID_SDK_ROOT $HOME/Library/Android/sdk
set -gx JAVA_HOME $HOME/coding/hackathon/monad/tmp/claude/jdk17/Contents/Home
fish_add_path $ANDROID_HOME/platform-tools $ANDROID_HOME/emulator $ANDROID_HOME/cmdline-tools/latest/bin $JAVA_HOME/bin
set -gx GRADLE_USER_HOME $HOME/coding/hackathon/monad/tmp/claude/gradle-home
set -gx __UNSAFE_EXPO_HOME_DIRECTORY $HOME/coding/hackathon/monad/tmp/claude/expo-home
set -gx EXPO_NO_TELEMETRY 1
set -gx ANDROID_USER_HOME $HOME/coding/hackathon/monad/tmp/claude/android-home
