# for bash/zsh and for scripted builds: . scripts/android-env.sh
export ANDROID_HOME="$HOME/coding/hackathon/monad/tmp/claude/android-sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export JAVA_HOME="$HOME/coding/hackathon/monad/tmp/claude/jdk17/Contents/Home"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin:$JAVA_HOME/bin:$PATH"
export GRADLE_USER_HOME="$HOME/coding/hackathon/monad/tmp/claude/gradle-home"
export __UNSAFE_EXPO_HOME_DIRECTORY="$HOME/coding/hackathon/monad/tmp/claude/expo-home"
export EXPO_NO_TELEMETRY=1
export ANDROID_USER_HOME="$HOME/coding/hackathon/monad/tmp/claude/android-home"
