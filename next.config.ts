import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";

function getLocalDevOrigins(): string[] {
  const addresses = Object.values(networkInterfaces()).flatMap((network) =>
    (network ?? [])
      .filter((address) => address.family === "IPv4" && !address.internal)
      .map((address) => address.address),
  );

  return [...new Set(addresses)];
}

const nextConfig: NextConfig = {
  allowedDevOrigins:
    process.env.NODE_ENV === "development" ? getLocalDevOrigins() : [],
};

export default nextConfig;
