# How to Run FitConnect on iOS

I have already started the development server for you!

## Quick Start
1.  **Simulator**: The app should be opening on the iOS Simulator (iPhone 17 Pro Max) automatically.
    -   If not, press `i` in the terminal running the Metro Bundler.
2.  **Physical Device**: Scan the QR code in the terminal with your camera (requires Expo Go or a Development Build).

## Manual Command
If you need to restart the server manually:
```bash
npx expo start --ios
```

## Troubleshooting
-   **"Development Build" vs. "Expo Go"**: Since we added native modules (widgets, permissions), you are running a "Development Build". Ensure you have installed the custom client on your simulator.
    -   To rebuild the dev client: `npx eas-cli build --profile development --platform ios --local`

## Notes
-   I noticed a **Firebase Index Warning** in the logs. You might need to click the link in the terminal to create the missing index for optimal performance.
