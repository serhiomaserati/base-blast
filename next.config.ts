import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config) => {
    config.externals.push("pino-pretty", "lokijs", "encoding");
    // `@react-native-async-storage/async-storage` is an optional RN dependency
    // of the MetaMask SDK, not needed on web. Swap it for an empty module to
    // get rid of the "Module not found" warning at build time.
    config.resolve.alias = {
      ...config.resolve.alias,
      "@react-native-async-storage/async-storage": false,
    };
    return config;
  },
};

export default nextConfig;
