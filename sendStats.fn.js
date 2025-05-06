var net = require("net");
const dgram = require("dgram");

module.exports = { sendStats, addStats, addStatsD };

let udp_client;

let _send_to;

const host = process.env.STATSD_HOST || 'h01.aipika.tech';

sendStats.message = "";

/**
 *
 * @param arrMetricValueTime [] example: ["cbh.events.User_LoggedIn.Sent" "1" "323423324"] (timestamp)
 */
function sendStats(arrMetricValueTime) {
    if (!host) {
        return;
    }

    if (arrMetricValueTime) {
        sendStats.message +=
            [arrMetricValueTime]
                .map(function (arrMetricValueTime) {
                    return (
                        arrMetricValueTime[0] +
                        " " +
                        arrMetricValueTime[1] +
                        " " +
                        arrMetricValueTime[2]
                    );
                })
                .join("\n") + "\n";
    }

    // console.log('sendStats.message.length=', sendStats.message.length);

    if (!_send_to) {
        _send_to = setTimeout(function () {
            var client = new net.Socket();

            (function (message) {
                client.connect(2003, host, function () {
                    client.write(message, function () {
                        _send_to = null;
                        if (message.length) {
                            sendStats();
                        }
                        client.end();
                    });
                });

                client.on("error", function () {
                    console.log("error on connect");
                    // empty listener to bypass network errors
                });
            })(sendStats.message);
            sendStats.message = "";
        }, 0);
    }
}

let metric2value =  {};

;(function sendAggregatedStats() {
    setTimeout(() => {
        let time = Math.floor(Date.now() / 1000);
        for(let i in metric2value) {
            sendStats([i, metric2value[i], time]);
            delete metric2value[i];
        }
        sendAggregatedStats();
    }, 30 * 1000 - Date.now() % (30 * 1000));
})();

function addStats(metric, value = 1, type = "c") {
    metric2value[metric] = (metric2value[metric] || 0) + value;
    addStatsD(metric, value, type);
}

let udp_client_timeout;

function addStatsD(metric, value = 1, type = "c") {
    if (!host) {
        return;
    }
    if (!udp_client) {
        udp_client = dgram.createSocket("udp4");
    }

    if (udp_client_timeout) {
        clearTimeout(udp_client_timeout);
    }

    udp_client_timeout = setTimeout(() => {
        udp_client_timeout = undefined;
        udp_client.close();
        udp_client = undefined;
    }, 1000);

    udp_client.send(`${metric}:${value}|${type}`, 8125, host);
}

function sendStatsTest() {
    sendStats(["aipika.test.stat", 1.1, (Date.now() / 1000).toFixed(0)]);
    addStats("aipika.test.test_statsd", 1);
    addStats("aipika.test.test_statsd", 2);
    addStats("aipika.test.test_statsd", 3);
    addStats("aipika.test.test_timer", 300, "ms");
    addStats(
        `cbh.test_events._unrecognized_event.emitter.${
            process.env.STATSD_INSTANCE_NAME || "_unrecognized_instance"
        }.sent`,
        1
    );
}

// @ts-ignore
if (require.main === module && process.argv.indexOf("--test")) {
    sendStatsTest();
}