import { el } from "../lib/utils.js";
import {
    maskBits,
    toBin,
} from "../lib/bit.js";

function parseIntStrict(s, name) {
    const n = Number.parseInt((s ?? "").toString().trim(), 10);
    if (!Number.isFinite(n)) throw new Error(`Invalid ${name}`);
    return n;
}

// Parse IP address to number
function parseIP(ipStr) {
    const parts = ipStr.trim().split('.');
    if (parts.length !== 4) throw new Error(`Invalid IP address: ${ipStr}`);
    let num = 0n;
    for (let i = 0; i < 4; i++) {
        const part = parseIntStrict(parts[i], `IP octet ${i + 1}`);
        if (part < 0 || part > 255) throw new Error(`Invalid IP octet: ${part}`);
        num = (num << 8n) + BigInt(part);
    }
    return num;
}

// Parse CIDR or subnet mask
function parseSubnetMask(mask) {
    if (mask.includes('/')) {
        // CIDR notation
        const parts = mask.split('/');
        const ip = parseIP(parts[0]);
        const cidr = parseIntStrict(parts[1], "CIDR");
        if (cidr < 0 || cidr > 32) throw new Error(`Invalid CIDR: ${cidr}`);
        return { ip, cidr };
    } else if (mask.includes('.')) {
        // Subnet mask
        const maskNum = parseIP(mask);
        // Count leading 1s
        let cidr = 0;
        let temp = maskNum;
        for (let i = 0; i < 32; i++) {
            if (temp & 1n) cidr++;
            else break;
            temp >>= 1n;
        }
        // Check if it's a valid mask (all 1s followed by all 0s)
        const expectedMask = (maskBits(cidr) << BigInt(32 - cidr));
        if (maskNum !== expectedMask) throw new Error(`Invalid subnet mask: ${mask}`);
        return { ip: null, cidr };
    } else {
        // Just CIDR number
        const cidr = parseIntStrict(mask, "CIDR");
        if (cidr < 0 || cidr > 32) throw new Error(`Invalid CIDR: ${cidr}`);
        return { ip: null, cidr };
    }
}

// Format IP from number
function formatIP(ipNum) {
    const parts = [];
    for (let i = 3; i >= 0; i--) {
        parts.push(Number((ipNum >> BigInt(i * 8)) & 0xFFn));
    }
    return parts.join('.');
}

// Subnet Calculator
function calculateSubnet(ipStr, maskStr) {
    const steps = [];
    
    steps.push("=== SUBNET CALCULATOR ===");
    steps.push("");
    
    // Check if IP and mask are combined (e.g., "192.168.1.100/24")
    let actualIP = ipStr;
    let actualMask = maskStr;
    
    if (ipStr.includes('/')) {
        const parts = ipStr.split('/');
        actualIP = parts[0];
        actualMask = parts[1];
    }
    
    // Parse inputs
    const ip = parseIP(actualIP);
    steps.push(`Input: IP Address = ${actualIP}`);
    
    const maskInfo = parseSubnetMask(actualMask);
    let subnetMask, cidr;
    
    if (maskInfo.ip !== null) {
        // IP/CIDR format (shouldn't happen with current parseSubnetMask, but handle it)
        subnetMask = (maskBits(maskInfo.cidr) << BigInt(32 - maskInfo.cidr));
        cidr = maskInfo.cidr;
        steps.push(`Input: CIDR = /${cidr}`);
    } else {
        // Subnet mask or CIDR number
        if (actualMask.includes('.')) {
            subnetMask = parseIP(actualMask);
            cidr = maskInfo.cidr;
            steps.push(`Input: Subnet Mask = ${actualMask}`);
        } else {
            cidr = maskInfo.cidr;
            subnetMask = (maskBits(cidr) << BigInt(32 - cidr));
            steps.push(`Input: CIDR = /${cidr}`);
        }
    }
    
    steps.push("");
    
    // Step 1: Show binary representation
    steps.push("Step 1: Binary Representation");
    steps.push(`  IP Address:    ${toBin(ip, 32)}`);
    steps.push(`  Subnet Mask:   ${toBin(subnetMask, 32)}`);
    steps.push(`  Network Bits:  ${cidr} (first ${cidr} bits)`);
    steps.push(`  Host Bits:     ${32 - cidr} (last ${32 - cidr} bits)`);
    steps.push("");
    
    // Step 2: Calculate network address (AND operation)
    steps.push("Step 2: Calculate Network Address");
    steps.push(`  Network Address = IP Address AND Subnet Mask`);
    steps.push(`  Network Address = ${toBin(ip, 32)}`);
    steps.push(`                    AND`);
    steps.push(`                    ${toBin(subnetMask, 32)}`);
    
    const networkAddr = ip & subnetMask;
    steps.push(`                    =`);
    steps.push(`                    ${toBin(networkAddr, 32)}`);
    steps.push(`  Network Address = ${formatIP(networkAddr)}`);
    steps.push("");
    
    // Step 3: Calculate broadcast address
    steps.push("Step 3: Calculate Broadcast Address");
    steps.push(`  Broadcast Address = Network Address OR (NOT Subnet Mask)`);
    steps.push(`  NOT Subnet Mask = ${toBin(~subnetMask & 0xFFFFFFFFn, 32)}`);
    
    const broadcastAddr = networkAddr | (~subnetMask & 0xFFFFFFFFn);
    steps.push(`  Broadcast Address = ${toBin(networkAddr, 32)}`);
    steps.push(`                      OR`);
    steps.push(`                      ${toBin(~subnetMask & 0xFFFFFFFFn, 32)}`);
    steps.push(`                      =`);
    steps.push(`                      ${toBin(broadcastAddr, 32)}`);
    steps.push(`  Broadcast Address = ${formatIP(broadcastAddr)}`);
    steps.push("");
    
    // Step 4: Calculate number of hosts
    steps.push("Step 4: Calculate Number of Hosts");
    const hostBits = 32 - cidr;
    const totalHosts = 2n ** BigInt(hostBits);
    const usableHosts = totalHosts > 2n ? totalHosts - 2n : 0n;
    
    steps.push(`  Host bits = ${32} - ${cidr} = ${hostBits} bits`);
    steps.push(`  Total possible addresses = 2^${hostBits} = ${totalHosts}`);
    steps.push(`  Usable host addresses = ${totalHosts} - 2 (network + broadcast) = ${usableHosts}`);
    steps.push("");
    
    // Step 5: Calculate IP range
    steps.push("Step 5: Usable IP Address Range");
    const firstHost = networkAddr + 1n;
    const lastHost = broadcastAddr - 1n;
    
    if (usableHosts > 0n) {
        steps.push(`  First usable IP: ${formatIP(firstHost)}`);
        steps.push(`  Last usable IP:  ${formatIP(lastHost)}`);
        steps.push(`  Range: ${formatIP(firstHost)} - ${formatIP(lastHost)}`);
    } else {
        steps.push(`  No usable hosts (network has only 2 addresses)`);
    }
    steps.push("");
    
    // Summary
    steps.push("=== SUMMARY ===");
    steps.push(`IP Address:        ${ipStr}`);
    steps.push(`Subnet Mask:       ${formatIP(subnetMask)}`);
    steps.push(`CIDR Notation:    /${cidr}`);
    steps.push(`Network Address:   ${formatIP(networkAddr)}`);
    steps.push(`Broadcast Address: ${formatIP(broadcastAddr)}`);
    steps.push(`Total Addresses:   ${totalHosts}`);
    steps.push(`Usable Hosts:      ${usableHosts}`);
    if (usableHosts > 0n) {
        steps.push(`Host Range:        ${formatIP(firstHost)} - ${formatIP(lastHost)}`);
    }
    
    return steps.join("\n");
}

export default {
    id: "memory-net",
    title: "Subnet Calculator",
    area: "Networking",
    tags: ["subnet", "networking", "CIDR", "IP", "subnetting"],
    
    notesHtml: `
        <p><b>Subnet Calculator</b></p>
        <p>Calculates subnet information from IP address and subnet mask.</p>
        <p><b>Features:</b></p>
        <ul>
            <li>Calculates network address, broadcast address, host range</li>
            <li>Shows bitwise AND operations step-by-step</li>
            <li>Supports CIDR notation (/24) or subnet mask (255.255.255.0)</li>
            <li>Shows binary representations of all calculations</li>
            <li>Calculates number of usable hosts</li>
        </ul>
        <p><b>Input formats:</b></p>
        <ul>
            <li>IP: <code>192.168.1.100</code></li>
            <li>Mask: <code>255.255.255.0</code> or <code>/24</code> or <code>192.168.1.100/24</code></li>
        </ul>
        <p><b>Output:</b></p>
        <ul>
            <li>Network address (bitwise AND of IP and mask)</li>
            <li>Broadcast address</li>
            <li>Total addresses and usable hosts</li>
            <li>Range of usable IP addresses</li>
        </ul>
        <p><b>IPv4 Subnet Mask Reference Chart:</b></p>
        <div style="overflow-x: auto; margin-top: 8px;">
        <table style="border-collapse: collapse; width: 100%; font-size: 12px;">
            <thead>
                <tr style="background-color: #444; color: white;">
                    <th style="padding: 6px; border: 1px solid #666; text-align: center;">Prefix</th>
                    <th style="padding: 6px; border: 1px solid #666; text-align: center;">IP Addresses</th>
                    <th style="padding: 6px; border: 1px solid #666; text-align: center;">Subnet Mask</th>
                    <th style="padding: 6px; border: 1px solid #666; text-align: center;">Host Bits</th>
                </tr>
            </thead>
            <tbody>
                <tr style="background-color: #f5f5f5;"><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">/32</td><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">1</td><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">255.255.255.255</td><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">0</td></tr>
                <tr style="background-color: white;"><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">/31</td><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">2</td><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">255.255.255.254</td><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">1</td></tr>
                <tr style="background-color: #f5f5f5;"><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">/30</td><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">4</td><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">255.255.255.252</td><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">2</td></tr>
                <tr style="background-color: white;"><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">/29</td><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">8</td><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">255.255.255.248</td><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">3</td></tr>
                <tr style="background-color: #f5f5f5;"><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">/28</td><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">16</td><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">255.255.255.240</td><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">4</td></tr>
                <tr style="background-color: white;"><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">/27</td><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">32</td><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">255.255.255.224</td><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">5</td></tr>
                <tr style="background-color: #f5f5f5;"><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">/26</td><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">64</td><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">255.255.255.192</td><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">6</td></tr>
                <tr style="background-color: white;"><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">/25</td><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">128</td><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">255.255.255.128</td><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">7</td></tr>
                <tr style="background-color: #f5f5f5;"><td style="padding: 4px; border: 1px solid #ddd; text-align: center;"><b>/24</b></td><td style="padding: 4px; border: 1px solid #ddd; text-align: center;"><b>256</b></td><td style="padding: 4px; border: 1px solid #ddd; text-align: center;"><b>255.255.255.0</b></td><td style="padding: 4px; border: 1px solid #ddd; text-align: center;"><b>8</b></td></tr>
                <tr style="background-color: white;"><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">/23</td><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">512</td><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">255.255.254.0</td><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">9</td></tr>
                <tr style="background-color: #f5f5f5;"><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">/22</td><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">1,024</td><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">255.255.252.0</td><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">10</td></tr>
                <tr style="background-color: white;"><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">/21</td><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">2,048</td><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">255.255.248.0</td><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">11</td></tr>
                <tr style="background-color: #f5f5f5;"><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">/20</td><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">4,096</td><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">255.255.240.0</td><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">12</td></tr>
                <tr style="background-color: white;"><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">/19</td><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">8,192</td><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">255.255.224.0</td><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">13</td></tr>
                <tr style="background-color: #f5f5f5;"><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">/18</td><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">16,384</td><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">255.255.192.0</td><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">14</td></tr>
                <tr style="background-color: white;"><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">/17</td><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">32,768</td><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">255.255.128.0</td><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">15</td></tr>
                <tr style="background-color: #f5f5f5;"><td style="padding: 4px; border: 1px solid #ddd; text-align: center;"><b>/16</b></td><td style="padding: 4px; border: 1px solid #ddd; text-align: center;"><b>65,536</b></td><td style="padding: 4px; border: 1px solid #ddd; text-align: center;"><b>255.255.0.0</b></td><td style="padding: 4px; border: 1px solid #ddd; text-align: center;"><b>16</b></td></tr>
                <tr style="background-color: white;"><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">/15</td><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">131,072</td><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">255.254.0.0</td><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">17</td></tr>
                <tr style="background-color: #f5f5f5;"><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">/14</td><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">262,144</td><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">255.252.0.0</td><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">18</td></tr>
                <tr style="background-color: white;"><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">/13</td><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">524,288</td><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">255.248.0.0</td><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">19</td></tr>
                <tr style="background-color: #f5f5f5;"><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">/12</td><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">1,048,576</td><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">255.240.0.0</td><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">20</td></tr>
                <tr style="background-color: white;"><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">/11</td><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">2,097,152</td><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">255.224.0.0</td><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">21</td></tr>
                <tr style="background-color: #f5f5f5;"><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">/10</td><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">4,194,304</td><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">255.192.0.0</td><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">22</td></tr>
                <tr style="background-color: white;"><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">/9</td><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">8,388,608</td><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">255.128.0.0</td><td style="padding: 4px; border: 1px solid #ddd; text-align: center;">23</td></tr>
                <tr style="background-color: #f5f5f5;"><td style="padding: 4px; border: 1px solid #ddd; text-align: center;"><b>/8</b></td><td style="padding: 4px; border: 1px solid #ddd; text-align: center;"><b>16,777,216</b></td><td style="padding: 4px; border: 1px solid #ddd; text-align: center;"><b>255.0.0.0</b></td><td style="padding: 4px; border: 1px solid #ddd; text-align: center;"><b>24</b></td></tr>
            </tbody>
        </table>
        </div>
        <p style="margin-top: 8px; font-size: 11px; color: #666;"><i>Common subnets: /24 (Class C), /16 (Class B), /8 (Class A) are highlighted</i></p>
    `,
    
    render(container, ctx) {
        const s = ctx.state;
        
        const state = {
            ipAddress: s.ipAddress ?? "192.168.1.100",
            subnetMask: s.subnetMask ?? "255.255.255.0",
        };
        
        // Subnet inputs
        const ipAddress = el("input", { class: "search", type: "text", placeholder: "192.168.1.100" });
        ipAddress.value = state.ipAddress;
        
        const subnetMask = el("input", { class: "search", type: "text", placeholder: "255.255.255.0 or /24" });
        subnetMask.value = state.subnetMask;
        
        const form = el("div", {}, [
            el("div", { class: "nav-tag", text: "IP Address:" }),
            ipAddress,
            el("div", { class: "nav-tag", text: "Subnet Mask or CIDR (/24, 255.255.255.0, or 192.168.1.100/24):" }),
            subnetMask,
        ]);
        
        container.appendChild(form);
        ctx.setNotes?.(this.notesHtml);
        
        const persist = () => {
            ctx.setState({
                ...ctx.state,
                ipAddress: ipAddress.value,
                subnetMask: subnetMask.value,
            });
        };
        
        ipAddress.addEventListener("input", persist);
        subnetMask.addEventListener("input", persist);
    },
    
    compute(ctx) {
        const s = ctx.state;
        
        // Subnet calculation
        const ipStr = (s.ipAddress || "").trim();
        const maskStr = (s.subnetMask || "").trim();
        
        if (!ipStr) {
            throw new Error("Please enter an IP address");
        }
        if (!maskStr) {
            throw new Error("Please enter a subnet mask or CIDR");
        }
        
        return calculateSubnet(ipStr, maskStr);
    },
};
