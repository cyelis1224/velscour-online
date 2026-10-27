#!/bin/bash
set -e

SDK_DIR="$HOME/.android-sdk"
mkdir -p "$SDK_DIR/cmdline-tools"

if [ ! -d "$SDK_DIR/cmdline-tools/latest" ]; then
  echo "Downloading Android Command-Line Tools..."
  curl -o /tmp/cmdline-tools.zip -L https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip
  unzip -q /tmp/cmdline-tools.zip -d "$SDK_DIR/cmdline-tools"
  mv "$SDK_DIR/cmdline-tools/cmdline-tools" "$SDK_DIR/cmdline-tools/latest"
  rm /tmp/cmdline-tools.zip
fi

export ANDROID_HOME="$SDK_DIR"
export PATH="$SDK_DIR/cmdline-tools/latest/bin:$SDK_DIR/platform-tools:$PATH"

echo "Installing Android SDK Platform & Build-Tools (API 34)..."
yes | sdkmanager --licenses > /dev/null 2>&1 || true
sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0"

echo "Writing android/local.properties..."
echo "sdk.dir=$SDK_DIR" > android/local.properties

echo "Android SDK setup complete!"
