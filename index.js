const ethers = require("ethers");
const moment = require("moment-timezone");
const config = require("./config.json");
require("dotenv").config();
const Big = require('big.js');

// Uniswap V2 ABI
const IUniswapV2Pair = require("@uniswap/v2-core/build/IUniswapV2Pair.json")

// Uniswap V3 ABI
const IUniswapV3Pool = require("@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json");

// ERC20 ABI for token information
const IERC20 = require('@openzeppelin/contracts/build/contracts/ERC20.json')

// Set up node provider URLs
const WS_NODE_PROVIDER_URL = `${process.env.WS_NODE_PROVIDER_URL}`;
const UNISWAP_V2_PAIR_ADDRESS = config.UNISWAP_V2_PAIR_ADDRESS;
const UNISWAP_V3_POOL_ADDRESS = config.UNISWAP_V3_POOL_ADDRESS;
const PRIMARY_TOKEN_SYMBOL = config.PRIMARY_TOKEN_SYMBOL;

const UNITS = config.PRICE_UNITS
const PRICE_DIFFERENCE = config.PRICE_DIFFERENCE
const GAS_LIMIT = config.GAS_LIMIT
const GAS_PRICE = config.GAS_PRICE

const V3_QUOTER = config.V3.QUOTER;
const V3_FACTORY = config.V3.FACTORY;
const V3_ROUTER = config.V3.ROUTER;

const V2_FACTORY = config.V2.FACTORY;
const V2_ROUTER = config.V2.ROUTER;


// ANSI color codes for formatting console output
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const ROYAL_BLUE = "\x1b[34m";
const ORANGE = "\x1b[38;5;214m"; 
const RESET = "\x1b[0m";

let lastV2Ratio = null;
let lastV3Ratio = null;

// Define a class for Tokens
class Token {
  constructor(address, symbol, decimals, reserves = 0) {
    this.address = address;
    this.symbol = symbol;
    this.decimals = decimals;
    this.reserves = reserves;
  }

  formatAmount(amount) {
    return ethers.formatUnits(amount, this.decimals);
  }
}

// Uniswap V2 Monitoring
let v2Provider, v2PairContract, v2PairInfo;
const UNISWAP_V2_BURN_ADDRESS = '0x000000000000000000000000000000000000dead';

// Uniswap V3 Monitoring
let v3Provider, v3PoolContract, v3PoolInfo;

// Setup providers
function setupV2Provider() {
  v2Provider = new ethers.WebSocketProvider(WS_NODE_PROVIDER_URL);
  v2PairContract = new ethers.Contract(UNISWAP_V2_PAIR_ADDRESS, IUniswapV2Pair.abi, v2Provider);
}

function setupV3Provider() {
  v3Provider = new ethers.WebSocketProvider(WS_NODE_PROVIDER_URL);
  v3PoolContract = new ethers.Contract(UNISWAP_V3_POOL_ADDRESS, IUniswapV3Pool.abi, v3Provider);
}

function formatV2PairInfo(v2Pair) {

  console.log("Uniswap V2 Pair Info:", UNISWAP_V2_PAIR_ADDRESS);

  console.log("SYMBOL    ADDRESS                                     DECIMALS                  RESERVES");

  const row0 = [
    padString(v2Pair.token0.symbol, 10),
    padString(v2Pair.token0.address, 46),
    padString(v2Pair.token0.decimals.toString() + "n", 6, "right"),
    padString(v2Pair.token0.reserves.toString() + "n", 26, "right"),
  ];
  console.log(row0.join(""));

  const row1 = [
    padString(v2Pair.token1.symbol, 10),
    padString(v2Pair.token1.address, 46),
    padString(v2Pair.token1.decimals.toString() + "n", 6, "right"),
    padString(v2Pair.token1.reserves.toString() + "n", 26, "right"),
  ];
  console.log(row1.join(""));

  console.log("");
}

// Initialize Uniswap V2 Pair info
async function initializeV2PairInfo() {
  const [token0Address, token1Address, totalSupply, reserves, burnedLPTokens] = await Promise.all([
    v2PairContract.token0(),
    v2PairContract.token1(),
    v2PairContract.totalSupply(),
    v2PairContract.getReserves(),
    v2PairContract.balanceOf(UNISWAP_V2_BURN_ADDRESS),
  ]);

  const [token0Info, token1Info] = await Promise.all([
    getTokenInfo(token0Address),
    getTokenInfo(token1Address),
  ]);

  const token0 = new Token(token0Address, token0Info.symbol, token0Info.decimals, reserves[0]);
  const token1 = new Token(token1Address, token1Info.symbol, token1Info.decimals, reserves[1]);

  v2PairInfo = { token0, token1, totalSupply, burnedLPTokens };
  formatV2PairInfo(v2PairInfo);
  return v2PairInfo;
}

function formatV3PoolInfo(v3Pool) {

  console.log("Uniswap V3 Pool Info:", UNISWAP_V3_POOL_ADDRESS);

  console.log("SYMBOL    ADDRESS                                     DECIMALS                  RESERVES");
 
  const row0 = [
    padString(v3Pool.token0.symbol, 10),
    padString(v3Pool.token0.address, 46),
    padString(v3Pool.token0.decimals.toString() + "n", 6, "right"),
    padString(v3Pool.token0.reserves.toString() + "n", 26, "right"),
  ];

  console.log(row0.join(""));

  const row1 = [
    padString(v3Pool.token1.symbol, 10),
    padString(v3Pool.token1.address, 46),
    padString(v3Pool.token1.decimals.toString() + "n", 6, "right"),
    padString(v3Pool.token1.reserves.toString() + "n", 26, "right"),
  ];

  console.log(row1.join(""));
  console.log("");
  return v3Pool;
}

// Initialize Uniswap V3 Pool info
async function initializeV3PoolInfo() {
  const [token0Address, token1Address, fee, liquidity] = await Promise.all([
    v3PoolContract.token0(),
    v3PoolContract.token1(),
    v3PoolContract.fee(),
    v3PoolContract.liquidity(),
  ]);

  const [token0Info, token1Info] = await Promise.all([
    getTokenInfo(token0Address),
    getTokenInfo(token1Address),
  ]);

  const token0 = new Token(token0Address, token0Info.symbol, token0Info.decimals);
  const token1 = new Token(token1Address, token1Info.symbol, token1Info.decimals);

  v3PoolInfo = { token0, token1, fee, liquidity };
  formatV3PoolInfo(v3PoolInfo);
}

// Get token information (decimals and symbol)
async function getTokenInfo(tokenAddress) {
  const tokenContract = new ethers.Contract(tokenAddress, IERC20.abi, v2Provider); // Same provider for both V2 and V3
  const [decimals, symbol] = await Promise.all([tokenContract.decimals(), tokenContract.symbol()]);
  return { decimals, symbol };
}
const columnWidths = [10, 12, 10, 20, 20, 25, 10];

// Helper function to format the printed row
function formatSwapRow(date, poolId, swapType, token0Amount, token1Amount, ratio, priceDifference) {

  const row = [
    padString(`${date.format("HH:mm:ss")}`, columnWidths[0]),
    padString(poolId, columnWidths[1]),
    padString("  " + swapType, columnWidths[2]),
    padString(token0Amount.toFixed(6), columnWidths[3], "right"),
    padString(token1Amount.toFixed(6), columnWidths[4], "right"),
    padString("  " + ratio, columnWidths[5]),
    padString(priceDifference, columnWidths[6], "right")
  ];

  console.log(row.join(""));
}

async function calculateV2Price(_pairContract) {

  const reserves = await _pairContract.getReserves()

  return Big(reserves.reserve0).div(Big(reserves.reserve1))
}

async function calculateV3Price(_pool, _token0, _token1) {
  // Get sqrtPriceX96 from slot0
  const [sqrtPriceX96] = await _pool.slot0();

  // Convert sqrtPriceX96 (BigInt) to a string for Big.js compatibility
  const sqrtPriceBig = Big(sqrtPriceX96.toString());

  // Calculate price ratio using sqrtPriceX96
  const priceRatio = sqrtPriceBig.div(Big(2).pow(96)).pow(2);  // This gives the price ratio between token0 and token1

  // Log the intermediate values for debugging
  console.log("sqrtPriceX96:", sqrtPriceX96);
  console.log("priceRatio:", priceRatio.toString());

  // Get the decimal difference between token0 and token1 and convert to a regular number
  const decimalDifference = Number(_token0.decimals - _token1.decimals);  // Convert BigInt to regular number
  console.log("decimalDifference:", decimalDifference);

  // Adjust the price based on the decimal difference
  let adjustedPrice;
  if (decimalDifference > 0) {
    adjustedPrice = priceRatio.mul(Big(10).pow(decimalDifference));  // Scale the price if token0 has more decimals
  } else if (decimalDifference < 0) {
    adjustedPrice = priceRatio.div(Big(10).pow(Math.abs(decimalDifference)));  // Scale the price if token1 has more decimals
  } else {
    adjustedPrice = priceRatio;  // No scaling needed if decimals are the same
  }

  // Log adjusted price
  console.log("adjustedPrice:", adjustedPrice.toString());

  return adjustedPrice.toString();
}

// Compare the ratios and calculate percentage difference for arbitrage opportunity
function calculateArbitrageOpportunity(v2Ratio, v3Ratio) {
  const priceDifference = (((v3Ratio - v2Ratio) / v2Ratio) * 100).toFixed(2);

  // Define a threshold for arbitrage opportunity (e.g., 1%)
  const arbitrageThreshold = 1; // You can adjust this

  console.log(`V2 Ratio: ${v2Ratio}, V3 Ratio: ${v3Ratio} ... Price Difference: ${priceDifference}%`);

  if (Math.abs(priceDifference) > arbitrageThreshold) {
    console.log(`${GREEN}Arbitrage Opportunity Detected!${RESET}`);
    // You can implement your arbitrage logic here, like making a trade
  } else {
    console.log(`${RED}No significant arbitrage opportunity.${RESET}`);
  }
}

// Function to calculate the percentage difference between lastV3Ratio and lastV2Ratio
function calcDifference() {
  // Check if both ratios are available
  if (lastV3Ratio && lastV2Ratio) {
    const v2Ratio = parseFloat(lastV2Ratio);
    const v3Ratio = parseFloat(lastV3Ratio);

    // Calculate the percentage difference
    const difference = (((v3Ratio - v2Ratio) / v2Ratio) * 100).toFixed(2);

    // Return the difference
    return `${difference}%`;
  } else {
    return "N/A";
  }
}


// Subscribe to V2 Swap events
async function subscribeToV2Swaps() {
  v2PairContract.on("Swap", async (sender, amount0In, amount1In, amount0Out, amount1Out, to, event) => {
    const block = await event.getBlock();
    const date = moment(block.timestamp * 1000);

    let token0Amount = Number(ethers.formatUnits(amount0In > amount0Out ? amount0In - amount0Out : amount0Out - amount0In, v2PairInfo.token0.decimals));
    let token1Amount = Number(ethers.formatUnits(amount1In > amount1Out ? amount1In - amount1Out : amount1Out - amount1In, v2PairInfo.token1.decimals));

    // Compute and store the ratio for V2
    lastV2Ratio = (token0Amount / token1Amount).toFixed(7);

    // Display the computed ratio
    let ratio = `1 ${v2PairInfo.token1.symbol} ≈ ${lastV2Ratio} ${v2PairInfo.token0.symbol}`;

    // let ratio = `1 ${v2PairInfo.token1.symbol} ≈ ${(token0Amount / token1Amount).toFixed(7)} ${v2PairInfo.token0.symbol}`;

    // Determine the swap type and apply color coding
    let swapType;
    if (amount0In > 0 && amount1Out > 0) {
      swapType = PRIMARY_TOKEN_SYMBOL === v2PairInfo.token0.symbol ? `${RED}${v2PairInfo.token0.symbol}->${v2PairInfo.token1.symbol}${RESET}` : `${GREEN}${v2PairInfo.token0.symbol}->${v2PairInfo.token1.symbol}${RESET}`;
    } else {
      swapType = PRIMARY_TOKEN_SYMBOL === v2PairInfo.token1.symbol ? `${RED}${v2PairInfo.token1.symbol}->${v2PairInfo.token0.symbol}${RESET}` : `${GREEN}${v2PairInfo.token1.symbol}->${v2PairInfo.token0.symbol}${RESET}`;
    }

    let diff = calcDifference();
    formatSwapRow(date, `${ROYAL_BLUE}Uniswap V2${RESET}`, swapType, token0Amount, token1Amount, ratio, diff);
  });
}

// Subscribe to V3 Swap events
async function subscribeToV3Swaps() {
  v3PoolContract.on("Swap", async (sender, recipient, amount0, amount1, sqrtPriceX96, tick, liquidity, event) => {
    const block = await event.getBlock();
    const date = moment(block.timestamp * 1000);

    // Calculate the absolute token amounts
    let token0Amount = Math.abs(Number(ethers.formatUnits(amount0, v3PoolInfo.token0.decimals)));
    let token1Amount = Math.abs(Number(ethers.formatUnits(amount1, v3PoolInfo.token1.decimals)));

    // Safely calculate the swap ratio, handle division by zero

    // Compute and store the ratio for V3
    lastV3Ratio = (token0Amount / token1Amount).toFixed(7);

    // Display the computed ratio
    let ratio = "";
    if (token1Amount > 0) {
      ratio = `1 ${v3PoolInfo.token1.symbol} ≈ ${lastV3Ratio} ${v3PoolInfo.token0.symbol}`;
    } else {
      ratio = "N/A"; // Handle gracefully if token1Amount is zero
    }

    // Determine the swap type and apply color coding
    let swapType;
    if (amount0 > 0 && amount1 < 0) {
      // token0 -> token1
      swapType = PRIMARY_TOKEN_SYMBOL === v3PoolInfo.token0.symbol
        ? `${RED}${v3PoolInfo.token0.symbol}->${v3PoolInfo.token1.symbol}${RESET}`
        : `${GREEN}${v3PoolInfo.token0.symbol}->${v3PoolInfo.token1.symbol}${RESET}`;
    } else if (amount0 < 0 && amount1 > 0) {
      // token1 -> token0
      swapType = PRIMARY_TOKEN_SYMBOL === v3PoolInfo.token1.symbol
        ? `${RED}${v3PoolInfo.token1.symbol}->${v3PoolInfo.token0.symbol}${RESET}`
        : `${GREEN}${v3PoolInfo.token1.symbol}->${v3PoolInfo.token0.symbol}${RESET}`;
    } else {
      swapType = "Unknown"; // Handle edge cases if swap amounts are unclear
    }

    let diff = calcDifference();
    // Print the swap information
    formatSwapRow(date, `${ORANGE}Uniswap V3${RESET}`, swapType, token0Amount, token1Amount, ratio, diff);
  });
}

// Pad strings for formatting
function padString(str, length, align = "left") {
  return align === "right" ? str.padStart(length) : str.padEnd(length);
}

// Start monitoring Uniswap V2 and V3
async function startMonitoring() {
  
  setupV2Provider();
  setupV3Provider();

  
  let v2Pair = await initializeV2PairInfo();
  await initializeV3PoolInfo();

  await subscribeToV2Swaps();
  await subscribeToV3Swaps();

  const symbol0 = padString(v2Pair.token0.symbol, 10, "right");
  const symbol1 = padString(v2Pair.token1.symbol, 10, "right");

  console.log(`TIME      POOL ID     TYPE               ${symbol0}          ${symbol1}  RATIO               DIFFERENCE`)

}

startMonitoring().catch((error) => {
  console.error("Error in startMonitoring:", error);
  setTimeout(startMonitoring, 5000);
});
