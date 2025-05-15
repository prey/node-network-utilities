const { exec, execSync } = require('child_process');
const si = require('systeminformation');
const os = require('os');

function ensure_valid_nic(str) {
  if (str.match(/[^\w\- ]/))
    throw new Error("Invalid nic name given: " + str);
}

exports.mac_address_for = function(nicName, cb) {
  ensure_valid_nic(nicName);
  exec(
    `powershell -Command "Get-NetAdapter | Where-Object {$_.Name -like '*${nicName}'} | Select-Object -ExpandProperty MacAddress"`,
    (error, stdout) => {
      if (error) return cb(error);
      if (stdout === '' || !stdout) return cb(new Error('No MAC address found.'));
      cb(error, stdout.trim());
    },
  );
}

exports.get_active_network_interface_name = function(cb) {
  try {
    exec(
      `powershell -Command "Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -ne $null -and $_.NetAdapter.Status -eq 'Up' } | Select-Object -ExpandProperty InterfaceAlias"`,
      (error, stdout) => {
        if (error) return cb(error);
        if (stdout === '' || !stdout) return cb(new Error('Error getting network interface name. No standard output.'));
        const arr = stdout.split("\r\n");
        if (arr.length > 0) {
          cb(error, arr[0].trim());
        } else {
          return cb(new Error('Error getting network interface name.'));
        }
      },
    );
  } catch (error) {
    return cb(new Error(`Error executing command to get network interface name: ${error}`));
  }
};

exports.netmask_for = function(nicName, cb) {
  ensure_valid_nic(nicName);
  exports.mac_address_for(nicName, (err, mac) => {
    if (err) return cb(err);
    const macToSearch = mac.replaceAll('-', ':');
    exec(
      `powershell -Command "Get-WmiObject Win32_NetworkAdapterConfiguration | Where-Object {$_.MACAddress -eq '${macToSearch}'} | Where IPEnabled | Select -ExpandProperty IPSubnet | ConvertTo-Json"`,
      (error, stdout) => {
        if (error) return cb(error);
        if (stdout === '' || !stdout) return cb(new Error('Error getting netmask.'));
        try {
          const arr = JSON.parse(stdout.replaceAll('\r', '').replaceAll('\n', '').replaceAll(' ', '').trim());
          const ipRegex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
          if (ipRegex.test(arr[0])) {
            return cb(error, arr[0]);
          } else {
            if (ipRegex.test(arr[1])) {
              return cb(error, arr[1]);
            }
            return cb(new Error('No netmask found.'));
          }
        } catch (e) {
          cb(e);
        }
      },
    );
  });
};

exports.gateway_ip_for = function(nicName, cb) {
  ensure_valid_nic(nicName);
  exports.mac_address_for(nicName, (err, mac) => {
    if (err) return cb(err);
    exec(
      `powershell -Command "(Get-NetAdapter | Where-Object {$_.MacAddress -eq '${mac}'} | Get-NetIPConfiguration).IPv4DefaultGateway.NextHop"`,
      (error, stdout) => {
        if (error) return cb(error);
        if (stdout === '' || !stdout) return cb(new Error('Error getting gateway ip.'));
        cb(error, stdout.trim());
      },
    );
  });
};

exports.get_network_interfaces_list = function(callback) {
  let list = [];
  let nodeNics = os.networkInterfaces();

  const capitalize = (s) => {
    if (typeof s !== 'string') return ''
    return s.charAt(0).toUpperCase() + s.slice(1)
  }
  si.networkInterfaces((listNetworkInterface) => {
    const niList = Array.isArray(listNetworkInterface) ? listNetworkInterface : [listNetworkInterface];
    niList.forEach((netInterface) => {
      let obj = {};
      obj.name = netInterface.iface;
      obj.mac_address = netInterface.mac;
      obj.model = netInterface.ifaceName;
      obj.type = (netInterface.type) ? capitalize(netInterface.type): null;
      obj.netmask = (netInterface.ip4subnet) ? netInterface.ip4subnet : null;
      obj.gateway_ip = (netInterface.gateway_ip) ? netInterface.gateway_ip : null;;
        const nodeNic = nodeNics[obj.name] || [];
        nodeNic.forEach(function(type) {
          if (type.family == 'IPv4') {
            obj.ip_address = type.address;
          }
        });
        list.push(obj);
      try {
        const output = execSync(`powershell -Command "(Get-WmiObject Win32_NetworkAdapter | Where-Object {$_.MacAddress -eq '${netInterface.mac}'}).Manufacturer"`);
        obj.vendor = output;
      } catch (error) {
        obj.vendor = netInterface.ifaceName;
      }
    });
    callback(null, list);
  });
};
