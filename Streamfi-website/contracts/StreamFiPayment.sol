// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract StreamFiPayment {

    struct Movie {
        uint256 id;
        address creator;
        uint256 pricePerSecond;
        uint256 totalRevenue;
        bool exists;
    }

    struct Investor {
        uint256 shares;
        uint256 balance;
    }

    struct Stream {
        uint256 movieId;
        address user;
        uint256 startTime;
        uint256 lastSettledAt;
        uint256 totalSeconds;
        uint256 totalAmount;
        bool active;
    }

    uint256 public movieCount;

    address public platform;

    uint256 public constant CREATOR_SHARE = 60;
    uint256 public constant INVESTOR_SHARE = 30;
    uint256 public constant PLATFORM_SHARE = 10;

    mapping(uint256 => Movie) public movies;

    mapping(uint256 => mapping(address => Investor))
        public investors;

    // list of investor addresses per movie for pro-rata distribution
    mapping(uint256 => address[])
        public movieInvestors;

    mapping(uint256 => uint256)
        public totalShares;

    // user => movieId => stream
    mapping(address => mapping(uint256 => Stream))
        public streams;

    event MovieRegistered(
        uint256 movieId,
        address creator,
        uint256 pricePerSecond
    );

    event PaymentReceived(
        uint256 movieId,
        address user,
        uint256 amount
    );

    event InvestmentMade(
        uint256 movieId,
        address investor,
        uint256 shares
    );

    event Withdrawal(
        address user,
        uint256 amount
    );

    event StreamStarted(
        uint256 movieId,
        address user,
        uint256 startTime
    );

    event StreamSettled(
        uint256 movieId,
        address user,
        uint256 fromTime,
        uint256 toTime,
        uint256 secondsStreamed,
        uint256 amount
    );

    event StreamStopped(
        uint256 movieId,
        address user,
        uint256 stopTime,
        uint256 totalSeconds,
        uint256 totalPaid
    );

    constructor(address _platform) {
        platform = _platform;
    }

    function registerMovie(
        uint256 pricePerSecond,
        address creatorPayoutWallet
    ) external {

        require(
            pricePerSecond > 0,
            "Invalid price"
        );

        require(
            creatorPayoutWallet != address(0),
            "Invalid creator wallet"
        );

        movieCount++;

        movies[movieCount] = Movie({
            id: movieCount,
            creator: creatorPayoutWallet,
            pricePerSecond: pricePerSecond,
            totalRevenue: 0,
            exists: true
        });

        emit MovieRegistered(
            movieCount,
            creatorPayoutWallet,
            pricePerSecond
        );
    }

    function invest(
        uint256 movieId
    ) external payable {

        require(
            movies[movieId].exists,
            "Movie not found"
        );

        require(
            msg.value > 0,
            "No funds"
        );

        Investor storage investor =
            investors[movieId][msg.sender];

        // first time investing in this movie: track address
        if (investor.shares == 0) {
            movieInvestors[movieId].push(msg.sender);
        }

        investor.shares += msg.value;

        totalShares[movieId] += msg.value;

        emit InvestmentMade(
            movieId,
            msg.sender,
            msg.value
        );
    }

    function pay(
        uint256 movieId
    ) external payable {

        require(
            movies[movieId].exists,
            "Movie not found"
        );

        require(
            msg.value > 0,
            "Payment required"
        );

        Movie storage movie =
            movies[movieId];

        movie.totalRevenue += msg.value;

        uint256 creatorAmount =
            (msg.value * CREATOR_SHARE)
            / 100;

        uint256 investorAmount =
            (msg.value * INVESTOR_SHARE)
            / 100;

        uint256 platformAmount =
            (msg.value * PLATFORM_SHARE)
            / 100;

        (bool success, ) = payable(movie.creator)
            .call{value: creatorAmount}("");
        require(success, "Creator transfer failed");

        (bool platformSuccess, ) = payable(platform)
            .call{value: platformAmount}("");
        require(platformSuccess, "Platform transfer failed");

        distributeToInvestors(
            movieId,
            investorAmount
        );

        emit PaymentReceived(
            movieId,
            msg.sender,
            msg.value
        );
    }

    function distributeToInvestors(
        uint256 movieId,
        uint256 amount
    ) internal {

        uint256 shares =
            totalShares[movieId];

        if (shares == 0) {
            (bool success, ) = payable(platform)
                .call{value: amount}("");
            require(success, "Platform transfer failed");
            return;
        }

        // simplified pro-rata distribution
        // NOTE: this is O(number of investors) and intended
        // for small investor sets managed by the platform.

        address[] storage investorList =
            movieInvestors[movieId];

        uint256 len = investorList.length;
        uint256 activeInvestorCount;

        for (uint256 i = 0; i < len; i++) {
            if (investors[movieId][investorList[i]].shares > 0) {
                activeInvestorCount++;
            }
        }

        if (activeInvestorCount == 0) {
            (bool success2, ) = payable(platform)
                .call{value: amount}("");
            require(success2, "Platform transfer failed");
            return;
        }

        uint256 totalDistributed;
        uint256 activeSeen;

        for (uint256 i = 0; i < len; i++) {
            address investorAddr = investorList[i];
            Investor storage inv =
                investors[movieId][investorAddr];

            if (inv.shares == 0) {
                continue;
            }

            activeSeen++;

            uint256 portion =
                activeSeen == activeInvestorCount
                    ? amount - totalDistributed
                    : (amount * inv.shares) / shares;

            totalDistributed += portion;

            (bool success3, ) = payable(investorAddr)
                .call{value: portion}("");
            require(success3, "Investor transfer failed");
        }

        require(totalDistributed == amount, "Distribution mismatch");
    }

    // --- Pay-per-second streaming primitives ---

    /// @notice Called by HSP to start a pay-per-second stream for a movie.
    function startStream(uint256 movieId) external {
        require(movies[movieId].exists, "Movie not found");

        Stream storage s = streams[msg.sender][movieId];
        require(!s.active, "Stream already active");

        s.movieId = movieId;
        s.user = msg.sender;
        s.startTime = block.timestamp;
        s.lastSettledAt = block.timestamp;
        s.active = true;

        emit StreamStarted(movieId, msg.sender, block.timestamp);
    }

    /// @notice Called by HSP to settle up to `block.timestamp`.
    /// It calculates seconds streamed since last settlement and
    /// executes a PaymentReceived with the corresponding amount.
    function settleStream(uint256 movieId) external payable {
        Stream storage s = streams[msg.sender][movieId];
        require(s.active, "No active stream");

        Movie storage movie = movies[movieId];
        require(movie.exists, "Movie not found");

        uint256 fromTime = s.lastSettledAt;
        uint256 toTime = block.timestamp;
        require(toTime > fromTime, "Nothing to settle");

        uint256 secondsStreamed = toTime - fromTime;
        uint256 amountDue = secondsStreamed * movie.pricePerSecond;

        require(msg.value == amountDue, "Incorrect payment");

        s.lastSettledAt = toTime;
        s.totalSeconds += secondsStreamed;
    s.totalAmount += amountDue;

        _handlePayment(movieId, msg.sender, amountDue);

        emit StreamSettled(
            movieId,
            msg.sender,
            fromTime,
            toTime,
            secondsStreamed,
            amountDue
        );
    }

    /// @notice Called by HSP when the stream ends.
    /// Must be called after a final settleStream.
    function stopStream(uint256 movieId) external {
        Stream storage s = streams[msg.sender][movieId];
        require(s.active, "No active stream");

        s.active = false;

        emit StreamStopped(
            movieId,
            msg.sender,
            block.timestamp,
            s.totalSeconds,
            s.totalAmount
        );
    }

    function _handlePayment(
        uint256 movieId,
        address payer,
        uint256 amount
    ) internal {
        Movie storage movie = movies[movieId];

        movie.totalRevenue += amount;

        uint256 creatorAmount = (amount * CREATOR_SHARE) / 100;
        uint256 investorAmount = (amount * INVESTOR_SHARE) / 100;
        uint256 platformAmount = (amount * PLATFORM_SHARE) / 100;

        (bool success, ) = payable(movie.creator).call{value: creatorAmount}("");
        require(success, "Creator transfer failed");

        (bool platformSuccess, ) = payable(platform).call{value: platformAmount}("");
        require(platformSuccess, "Platform transfer failed");

        distributeToInvestors(movieId, investorAmount);

        emit PaymentReceived(movieId, payer, amount);
    }

    function withdrawInvestorFunds(
        uint256 movieId
    ) external {

        uint256 balance =
            investors[movieId][msg.sender]
                .balance;

        require(
            balance > 0,
            "No balance"
        );

        investors[movieId][msg.sender]
            .balance = 0;

        (bool success, ) = payable(msg.sender)
            .call{value: balance}("");
        require(success, "Withdrawal transfer failed");

        emit Withdrawal(
            msg.sender,
            balance
        );
    }
}