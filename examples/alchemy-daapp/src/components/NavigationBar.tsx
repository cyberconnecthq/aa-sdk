import { Box, Flex } from "@chakra-ui/react";
import Link from "next/link";
import Image from "next/image";
import { ConnectButton } from "@rainbow-me/rainbowkit";

export default function NavigationBar() {
  return (
    <Flex
      padding="20px 10px"
      marginBottom="25px"
      justifyContent="center"
      alignItems="center"
      position="relative"
    >
      <Link href="/">
        <Image width={300} height={100} src="/logo.svg" alt="logo" />
      </Link>
      <Box position="absolute" right="20px" top="20px">
        <ConnectButton />
      </Box>
    </Flex>
  );
}
